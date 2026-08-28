/**
 * What the command line hands back to the shell.
 */

/** Nothing to report. */
export const EXIT_OK = 0;

/** At least one finding serious enough to fail the run. Warnings alone do not. */
export const EXIT_LINT_ERRORS = 1;

/** The command could not run: bad arguments, missing or invalid config. */
export const EXIT_USAGE = 2;
