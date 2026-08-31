/**
 * Saying something to whoever is running gurkencheck, without deciding where
 * it goes.
 *
 * The README promises that nothing in the library writes to the console. That
 * was true only by convention - no library entry point happened to call the
 * logger - and not quite true even then, since `runStats` is exported and
 * wrote straight to stderr. Reporting through here instead makes it hold by
 * construction: the library says what happened, and the command line is what
 * decides that goes to stderr in red.
 *
 * This is for things said *about* a run. What a run produces - the findings,
 * the statistics - is the formatter's business and goes to stdout.
 */
import * as logger from './logger.ts';

/**
 * How a diagnostic is meant to read.
 *
 * `detail` is a line belonging with the error above it, which is why it is
 * here rather than being left to the caller to indent.
 */
export type DiagnosticLevel = 'error' | 'detail' | 'notice';

export interface Diagnostic {
  level: DiagnosticLevel;
  message: string;
  /** Lines listed under the message, such as what is wrong with a config. */
  details?: readonly string[];
}

/** Where diagnostics go. */
export interface Diagnostics {
  report(diagnostic: Diagnostic): void;
}

/** Says nothing at all. What the library does unless it is told otherwise. */
export const SILENT: Diagnostics = {
  report: () => undefined,
};

export interface CollectedDiagnostics extends Diagnostics {
  /** Everything reported so far, in order. */
  readonly reported: readonly Diagnostic[];
}

/** Keeps what it is told, for a test or for something showing it later. */
export function collectDiagnostics(): CollectedDiagnostics {
  const reported: Diagnostic[] = [];
  return {
    reported,
    report(diagnostic: Diagnostic): void {
      reported.push(diagnostic);
    },
  };
}

/**
 * Writes to stderr, the way the command line always has.
 *
 * Findings go to stdout so they can be redirected or piped; anything about
 * the run itself goes to stderr, so piping the one does not swallow the
 * other.
 */
export const TO_STDERR: Diagnostics = {
  report({level, message, details}: Diagnostic): void {
    if (level === 'error') {
      logger.boldError(message);
    } else if (level === 'detail') {
      logger.error(message);
    } else {
      logger.note(message);
    }
    for (const detail of details ?? []) {
      logger.error(`- ${detail}`);
    }
  },
};
