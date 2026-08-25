import type {FileResult} from '../types.ts';

/** Machine readable output: the results array as a single line of JSON. */
export function printResults(results: readonly FileResult[]): void {
  console.error(JSON.stringify(results));
}
