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
import {reasonOf} from './util/thrown.ts';

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
   * True when a run would check the feature file at this absolute path. A
   * change to one it would not - outside the glob it was given, or ignored
   * - is passed over: announced, with a pass after it saying no errors were
   * found, it read as the file just broken being clean.
   */
  checks?: (absolutePath: string) => boolean;
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
function mayHoldFeatures(absolutePath: string, wasDirectory: boolean): boolean {
  try {
    // A directory now there is worth a pass only if it holds a feature file:
    // a new empty one, made before anything is put in it, changes nothing.
    return fs.statSync(absolutePath).isDirectory() && holdsFeatureFile(absolutePath);
  } catch {
    return wasDirectory;
  }
}

/**
 * Every directory below `directory`, itself included, as the walk for
 * feature files would see them - not hidden ones, not node_modules.
 */
function directoriesBelow(directory: string): string[] {
  const found: string[] = [];
  const pending = [directory];
  while (pending.length > 0) {
    const next = pending.pop()!;
    found.push(next);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(next, {withFileTypes: true});
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        pending.push(path.join(next, entry.name));
      }
    }
  }
  return found;
}

/**
 * True when a feature file sits anywhere below `directory`, stopping at the
 * first - or when a directory cannot be read, which may hide some: a
 * directory made unreadable is a run that fails, and taken for an empty one
 * it left the results from before on screen.
 */
function holdsFeatureFile(directory: string): boolean {
  const pending = [directory];
  while (pending.length > 0) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(pending.pop()!, {withFileTypes: true});
    } catch {
      return true;
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

/** True when the path is a directory now, or was one when it went. */
function isDirectoryChange(absolutePath: string, wasDirectory: boolean): boolean {
  try {
    return fs.statSync(absolutePath).isDirectory();
  } catch {
    return wasDirectory;
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

/**
 * True for an error node's own recursive watch throws, uncaught, on meeting
 * a directory it may not read - Node 26 on Linux does, from its handler for
 * a change to the directory, besides saying so with an error event. The
 * event is taken for the change it is, so the throw is not a failure.
 */
export function isWatchAccessError(thrown: unknown): boolean {
  const {code, stack} = (thrown ?? {}) as {code?: unknown; stack?: unknown};
  return (
    (code === 'EACCES' || code === 'EPERM') &&
    typeof stack === 'string' &&
    stack.includes('internal/fs/recursive_watch')
  );
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
  /** Set once the watch has stopped, so nothing more is watched. */
  let closed = false;
  /** Watches the directories of listed files not watched yet. */
  let watchOutside = (): void => undefined;

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
        // Said as the pass that takes the changes in starts, not when they
        // arrive: announced during a pass, the result after the notice was
        // that of the pass before them, and read as the answer to them.
        announce();
        againAfterThis = false;
        try {
          await check();
        } catch (thrown) {
          // What is being run belongs to the caller. A pass that falls over
          // must not end the watch, or you would have to start it again to
          // find out you had fixed the thing that broke it.
          diagnostics.report({
            level: 'error',
            message: `The check failed: ${reasonOf(thrown)}`,
          });
        }
        watchOutside();
      } while (againAfterThis);
    } finally {
      running = false;
    }
  };

  /** Says what has changed since the last pass started, if anything. */
  const announce = (): void => {
    if (changed.size === 0) {
      return;
    }
    const what = changed.size === 1 ? (([...changed][0] ?? 'a file') as string) : countChanges([...changed]);
    changed.clear();
    diagnostics.report({level: 'notice', message: `\n${what} changed - checking again`});
  };

  const schedule = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      void runCheck();
    }, settleMs);
    // A watch should not be the reason a process stays alive once the thing
    // it was watching for has been dealt with.
    timer.unref?.();
  };

  /** The directories below the roots, kept up to date as they change. */
  const directories = new Set<string>();
  /** Notes what the path is now: a directory and those below it, or gone. */
  const noteDirectories = (absolutePath: string): void => {
    let directory = false;
    try {
      directory = fs.statSync(absolutePath).isDirectory();
    } catch {
      // Gone, or not to be looked at: either way, not a directory now.
    }
    if (directory) {
      for (const below of directoriesBelow(absolutePath)) {
        directories.add(below);
      }
      return;
    }
    if (directories.delete(absolutePath)) {
      for (const known of directories) {
        if (known.startsWith(`${absolutePath}${path.sep}`)) {
          directories.delete(known);
        }
      }
    }
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

    noteDirectories(path.resolve(root));
    try {
      const watcher = fs.watch(root, {recursive: true}, (event, filename) => {
        // Some platforms hand over no name; there is nothing to filter on, so
        // check rather than risk missing a change.
        if (filename === null) {
          changed.add('a file');
          schedule();
          return;
        }
        const relativePath = filename.toString();
        const absolutePath = path.resolve(root, relativePath);
        const listed = files().has(absolutePath);
        // Whether a path that has gone was a directory is known from before,
        // not guessed from its name: Makefile, or the file vim writes to try
        // a directory out, going was announced as a directory and checked.
        const wasDirectory = directories.has(absolutePath);
        // Not below a hidden directory or node_modules, where the walk for
        // feature files does not go: .git alone changes by the hundred.
        if (!relativePath.split(path.sep).some((part) => part.startsWith('.') || part === 'node_modules')) {
          noteDirectories(absolutePath);
        }
        if (
          !listed &&
          relativePath.endsWith('.feature') &&
          ((options.only !== undefined && !options.only.has(absolutePath)) ||
            (options.checks !== undefined && !options.checks(absolutePath)))
        ) {
          return;
        }
        if (
          !listed &&
          (ignored(relativePath) ||
            (!isInteresting(relativePath, configFileName) &&
              // A move is a rename. macOS also reports a change under the
              // watched directory's own name, which is not one.
              !(event === 'rename' && mayHoldFeatures(absolutePath, wasDirectory))))
        ) {
          return;
        }
        // The path as you would type it: two files called login.feature in
        // different folders are two changes, and either could be the one.
        // A directory is named as one, so a notice does not count it as a file.
        changed.add(
          isDirectoryChange(absolutePath, wasDirectory) && !listed ? `${shown(absolutePath)}${path.sep}` : shown(absolutePath),
        );
        schedule();
      });
      watcher.on('error', (thrown: NodeJS.ErrnoException) => {
        // A directory below the root made unreadable: on Linux the recursive
        // watch says so with an error rather than an event, and goes on
        // watching. It is a change - a pass would say it cannot read the
        // directory - not the watch giving up, which ended it altogether.
        const resolvedRoot = path.resolve(root);
        if (
          (thrown.code === 'EACCES' || thrown.code === 'EPERM') &&
          typeof thrown.path === 'string' &&
          thrown.path.startsWith(`${resolvedRoot}${path.sep}`)
        ) {
          changed.add(`${shown(thrown.path)}${path.sep}`);
          schedule();
          return;
        }
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
        message: `Could not watch "${root}": ${reasonOf(thrown)}`,
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
  // would be nothing for it to change. Looked at again after every pass: a
  // configuration that has started extending a file elsewhere has a new
  // directory to watch, and edits to that file were never noticed.
  const outside = new Set<string>();
  watchOutside = (): void => {
    if (closed) {
      return;
    }
    for (const file of files()) {
      const directory = path.dirname(file);
      const covered = roots.some((root) => {
        const resolved = path.resolve(root);
        return directory === resolved || directory.startsWith(`${resolved}${path.sep}`);
      });
      if (covered || outside.has(directory)) {
        continue;
      }
      outside.add(directory);
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
  };
  watchOutside();

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
      closed = true;
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
