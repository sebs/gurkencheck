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
   * Stops the watch when it aborts.
   *
   * Ctrl-C stops it too. This is for a caller that is not a terminal - a test,
   * or an editor closing the project it was watching.
   */
  signal?: AbortSignal;
}

/** True when a change to this path could change what a run would report. */
export function isInteresting(relativePath: string, configFileName: string): boolean {
  const name = path.basename(relativePath);
  return relativePath.endsWith('.feature') || name === configFileName;
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
        changed.size === 1 ? (([...changed][0] ?? 'a file') as string) : `${changed.size} files`;
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
      const watcher = fs.watch(root, {recursive: true}, (_event, filename) => {
        // Some platforms hand over no name; there is nothing to filter on, so
        // check rather than risk missing a change.
        if (filename === null) {
          schedule();
          return;
        }
        const relativePath = filename.toString();
        if (ignored(relativePath) || !isInteresting(relativePath, configFileName)) {
          return;
        }
        changed.add(path.basename(relativePath));
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
