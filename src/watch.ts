/**
 * Checking again whenever the feature files change.
 *
 * This knows about watching and nothing about linting: it is handed something
 * to run, and runs it whenever the tree underneath changes. What that
 * something does - which formatter, which rules - is the caller's business.
 *
 * Every pass is a whole run. Keeping the parsed files between passes was the
 * obvious optimisation and is the wrong trade here: the rules that look
 * across files rebuild their state from every file anyway, so the only thing
 * caching saves is the reading and parsing - and it saves it by holding every
 * syntax tree in memory for as long as the process lives, which for a suite
 * of any size is hundreds of megabytes sitting idle between keystrokes. A
 * whole pass over a few thousand files takes well under a second, and the
 * memory stays where a bounded read-ahead put it.
 */
import fs from 'node:fs';
import path from 'node:path';
import {EXIT_OK} from './exit-codes.ts';
import type {Diagnostics} from './diagnostics.ts';

/** How long changes are allowed to keep arriving before a pass starts. */
export const DEFAULT_SETTLE_MS = 80;

export interface WatchOptions {
  /** Where diagnostics about the watch itself go. */
  diagnostics: Diagnostics;
  /**
   * How long to wait for changes to stop arriving before checking again.
   *
   * Saving a file is rarely one event: an editor may write, rename and
   * change the mode, and a formatter on save adds more. Waiting for the flurry
   * to end means one pass rather than four.
   */
  settleMs?: number;
  /** Names to take no notice of, matched against any part of the path. */
  ignore?: readonly string[];
  /**
   * Other files whose changes count, as absolute paths: a configuration named
   * with a directory, the files it extends, the ignore file. A function is
   * asked afresh on every change, so the list can follow a configuration
   * that has started extending something else.
   *
   * A file outside the watched directories has its own directory watched,
   * not the file itself: an editor saving by writing a new file and renaming
   * it over the old one would leave a watch on the file looking at nothing.
   */
  files?: readonly string[] | (() => readonly string[]);
  /**
   * The feature files the run checks, as absolute paths, when it is given
   * them one by one. A file is watched through its directory, and without
   * this every other feature file beside it would start a pass of its own.
   */
  only?: ReadonlySet<string>;
  /**
   * Stops the watch when it aborts.
   *
   * Ctrl-C stops it too. This is for a caller that is not a terminal - a test,
   * or an editor closing the project it was watching.
   */
  signal?: AbortSignal;
}

/**
 * True when a change to this path may have moved feature files: it is a
 * directory now, or it has gone and looked like one.
 *
 * Moving or renaming a folder is one event, naming the folder rather than
 * any of the feature files inside it, so judging by the name alone it was
 * passed over and the results on screen were those from before the move.
 */
function mayHoldFeatures(absolutePath: string): boolean {
  try {
    // A directory now there is worth a pass only if it holds a feature file:
    // a new empty one, made before anything is put in it, changes nothing.
    return fs.statSync(absolutePath).isDirectory() && holdsFeatureFile(absolutePath);
  } catch {
    const name = path.basename(absolutePath);
    return path.extname(name) === '' && !name.startsWith('.');
  }
}

/** True when a feature file sits anywhere below `directory`, stopping at the first. */
function holdsFeatureFile(directory: string): boolean {
  const pending = [directory];
  while (pending.length > 0) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(pending.pop()!, {withFileTypes: true});
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(entry.parentPath, entry.name);
      if (entry.isFile() && entry.name.endsWith('.feature')) return true;
      if (entry.isDirectory()) pending.push(full);
    }
  }
  return false;
}

/** True when the path is a directory now, or was not a feature file when it went. */
function isDirectoryChange(absolutePath: string): boolean {
  try {
    return fs.statSync(absolutePath).isDirectory();
  } catch {
    return !absolutePath.endsWith('.feature') && !path.basename(absolutePath).startsWith('.');
  }
}

/** `3 files`, or `2 files and 1 directory`, for a notice. */
function countChanges(changes: readonly string[]): string {
  const directories = changes.filter((change) => change.endsWith(path.sep)).length;
  const files = changes.length - directories;
  const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;
  if (directories === 0) return plural(files, 'file', 'files');
  if (files === 0) return plural(directories, 'directory', 'directories');
  return `${plural(files, 'file', 'files')} and ${plural(directories, 'directory', 'directories')}`;
}

/** A path relative to the working directory, as a notice shows it. */
function shown(absolutePath: string): string {
  return path.relative(process.cwd(), absolutePath) || absolutePath;
}

/** True when a change to this path could change what a run would report. */
export function isInteresting(relativePath: string, configFileName: string): boolean {
  const name = path.basename(relativePath);
  return relativePath.endsWith('.feature') || name === path.basename(configFileName);
}

/**
 * Runs `check` once, then again whenever something under `roots` changes,
 * until the process is interrupted.
 *
 * Resolves when it is stopped, so the caller can go on to exit tidily. A pass
 * failing does not stop the watch: the point of watching is to be told when
 * it stops failing.
 */
export async function watch(
  roots: readonly string[],
  configFileName: string,
  options: WatchOptions,
  check: () => Promise<unknown>,
): Promise<number> {
  const {diagnostics} = options;
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
  const ignore = options.ignore ?? [];

  const watchers: fs.FSWatcher[] = [];
  const changed = new Set<string>();
  /** Set once the watch is waiting, so a watcher failing then can end it. */
  let stopWatching: (() => void) | undefined;
  let timer: NodeJS.Timeout | undefined;
  let running = false;
  let againAfterThis = false;

  const ignored = (relativePath: string): boolean =>
    ignore.some((entry) => relativePath.split(path.sep).includes(entry));
  const files = (): Set<string> => {
    const listed = typeof options.files === 'function' ? options.files() : (options.files ?? []);
    return new Set(listed.map((file) => path.resolve(file)));
  };

  /**
   * Runs a pass, and one more afterwards if anything changed while it ran.
   * A change arriving mid-pass may or may not have been picked up, and
   * checking twice is cheaper than being wrong about it.
   */
  const runCheck = async (): Promise<void> => {
    if (running) {
      againAfterThis = true;
      return;
    }
    running = true;
    try {
      do {
        againAfterThis = false;
        try {
          await check();
        } catch (thrown) {
          // What is being run belongs to the caller. A pass that falls over
          // must not end the watch, or you would have to start it again to
          // find out you had fixed the thing that broke it.
          diagnostics.report({
            level: 'error',
            message: `The check failed: ${thrown instanceof Error ? thrown.message : String(thrown)}`,
          });
        }
      } while (againAfterThis);
    } finally {
      running = false;
    }
  };

  const schedule = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      const what =
        changed.size === 1 ? (([...changed][0] ?? 'a file') as string) : countChanges([...changed]);
      changed.clear();
      diagnostics.report({level: 'notice', message: `\n${what} changed - checking again`});
      void runCheck();
    }, settleMs);
    // A watch should not be the reason a process stays alive once the thing
    // it was watching for has been dealt with.
    timer.unref?.();
  };

  /** Watchers still working. A watcher that gives up takes itself out. */
  const living = new Set<fs.FSWatcher>();

  for (const root of roots) {
    // Checked before watching rather than left to fs.watch, because what
    // fs.watch does about a missing directory is not the same everywhere: it
    // throws on some platforms and reports an error event later on others,
    // and the second kind would leave this waiting on a watch of nothing.
    let directory = false;
    try {
      directory = fs.statSync(root).isDirectory();
    } catch {
      directory = false;
    }
    if (!directory) {
      diagnostics.report({
        level: 'error',
        message: `Could not watch "${root}": it is not a directory.`,
      });
      continue;
    }

    try {
      const watcher = fs.watch(root, {recursive: true}, (event, filename) => {
        // Some platforms hand over no name; there is nothing to filter on, so
        // check rather than risk missing a change.
        if (filename === null) {
          schedule();
          return;
        }
        const relativePath = filename.toString();
        const absolutePath = path.resolve(root, relativePath);
        const listed = files().has(absolutePath);
        if (options.only !== undefined && !listed && relativePath.endsWith('.feature') && !options.only.has(absolutePath)) {
          return;
        }
        if (
          !listed &&
          (ignored(relativePath) ||
            (!isInteresting(relativePath, configFileName) &&
              // A move is a rename. macOS also reports a change under the
              // watched directory's own name, which is not one.
              !(event === 'rename' && mayHoldFeatures(absolutePath))))
        ) {
          return;
        }
        // The path as you would type it: two files called login.feature in
        // different folders are two changes, and either could be the one.
        // A directory is named as one, so a notice does not count it as a file.
        changed.add(
          isDirectoryChange(absolutePath) && !listed ? `${shown(absolutePath)}${path.sep}` : shown(absolutePath),
        );
        schedule();
      });
      watcher.on('error', (thrown: Error) => {
        // One watch giving up should not take the others with it - but if
        // they all give up there is nothing left to wait for, and waiting
        // anyway would be a process that never returns.
        diagnostics.report({
          level: 'detail',
          message: `No longer watching "${root}": ${thrown.message}`,
        });
        watcher.close();
        living.delete(watcher);
        if (living.size === 0) {
          stopWatching?.();
        }
      });
      watchers.push(watcher);
      living.add(watcher);
    } catch (thrown) {
      diagnostics.report({
        level: 'error',
        message: `Could not watch "${root}": ${thrown instanceof Error ? thrown.message : String(thrown)}`,
      });
    }
  }

  if (watchers.length === 0) {
    diagnostics.report({
      level: 'error',
      message: 'Nothing could be watched, so there would be nothing to wait for.',
    });
    return EXIT_OK;
  }

  // Each root's own deletion, from the directory it is in: the recursive
  // watch on a root is often told nothing when the root itself goes, and the
  // results from before stayed on screen. Not counted among the living, like
  // the watches of listed files below.
  for (const root of roots) {
    const resolved = path.resolve(root);
    const parent = path.dirname(resolved);
    if (parent === resolved) continue;
    try {
      const watcher = fs.watch(parent, (_event, filename) => {
        if (filename !== null && filename.toString() === path.basename(resolved) && !fs.existsSync(resolved)) {
          changed.add(shown(resolved));
          schedule();
        }
      });
      watcher.on('error', () => watcher.close());
      watchers.push(watcher);
    } catch {
      // The root is watched all the same; only its going might be missed.
    }
  }

  // The directories of listed files the recursive watches do not reach, each
  // watched on its own. Not counted among the living: they are there to say
  // the configuration changed, and with no feature files left to watch there
  // would be nothing for it to change.
  const outside = new Set<string>();
  for (const file of files()) {
    const directory = path.dirname(file);
    const covered = roots.some((root) => {
      const resolved = path.resolve(root);
      return directory === resolved || directory.startsWith(`${resolved}${path.sep}`);
    });
    if (!covered) {
      outside.add(directory);
    }
  }
  for (const directory of outside) {
    try {
      const watcher = fs.watch(directory, (_event, filename) => {
        if (filename === null || files().has(path.join(directory, filename.toString()))) {
          changed.add(filename === null ? 'a file' : shown(path.join(directory, filename.toString())));
          schedule();
        }
      });
      watcher.on('error', () => watcher.close());
      watchers.push(watcher);
    } catch {
      // A configuration that cannot be watched still works; it only means a
      // change to it is picked up with the next change to a feature file.
    }
  }

  await runCheck();
  diagnostics.report({
    level: 'notice',
    message: '\nWatching for changes. Press Ctrl-C to stop.',
  });

  return await new Promise<number>((resolve) => {
    let stopped = false;
    const stop = (): void => {
      if (stopped) {
        return;
      }
      stopped = true;
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      options.signal?.removeEventListener('abort', stop);
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      for (const watcher of watchers) {
        watcher.close();
      }
      // The ^C the terminal echoed is sitting at the start of the line.
      diagnostics.report({level: 'notice', message: ''});
      resolve(EXIT_OK);
    };

    stopWatching = stop;
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);

    // A watcher may have given up while the first pass was running, in which
    // case there is nothing left to wait for.
    if (living.size === 0) {
      stop();
      return;
    }

    if (options.signal?.aborted === true) {
      stop();
    } else {
      options.signal?.addEventListener('abort', stop, {once: true});
    }
  });
}
