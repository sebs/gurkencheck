/**
 * The report as JSON.
 *
 * Nothing is cut short here: this is the format to keep alongside a build, so
 * that a later run has something to be compared against.
 */
import type {Statistics} from '../types.ts';

/** The whole report, indented so a diff of two runs is readable. */
export function toJson(statistics: Statistics): string {
  return JSON.stringify(statistics, null, 2);
}
