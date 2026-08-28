/**
 * The formats `gurkencheck stats --format` accepts.
 */
import type {Statistics} from '../types.ts';
import {toJson} from './json.ts';
import {toMarkdown} from './markdown.ts';
import {toText} from './text.ts';
import type {StatsFormatOptions} from './shared.ts';

/** Turns a finished statistics run into the text of a report. */
export type StatsFormatter = (statistics: Statistics, options: StatsFormatOptions) => string;

export const DEFAULT_STATS_FORMAT = 'text';

export const STATS_FORMATTERS: Record<string, StatsFormatter> = {
  text: toText,
  json: toJson,
  md: toMarkdown,
  markdown: toMarkdown,
};

/**
 * The formatter for a format name, or `undefined` when there is no such format.
 *
 * Asking the record for a key it does not have is not enough: every object
 * inherits `constructor`, `toString` and the rest from its prototype, so
 * `--format constructor` would come back with a function and be run as if it
 * were a formatter.
 */
export function getStatsFormatter(format: string | undefined): StatsFormatter | undefined {
  const name = format ?? DEFAULT_STATS_FORMAT;
  return Object.hasOwn(STATS_FORMATTERS, name) ? STATS_FORMATTERS[name] : undefined;
}

export {toJson, toMarkdown, toText};
export {DEFAULT_TOP} from './shared.ts';
export type {StatsFormatOptions} from './shared.ts';
