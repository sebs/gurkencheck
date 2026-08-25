import type {FileResult} from '../types.ts';

/**
 * Machine readable output: the results array as a single line of JSON.
 *
 * Results go to stdout so they can be redirected or piped. Anything that
 * stops the linter running is written to stderr instead.
 */
export function printResults(results: readonly FileResult[]): void {
  console.log(JSON.stringify(results));
}
