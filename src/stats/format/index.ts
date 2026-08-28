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

/** The formatter for a format name, or `undefined` when there is no such format. */
export function getStatsFormatter(format: string | undefined): StatsFormatter | undefined {
  return STATS_FORMATTERS[format ?? DEFAULT_STATS_FORMAT];
}

export {toJson, toMarkdown, toText};
export {DEFAULT_TOP} from './shared.ts';
export type {StatsFormatOptions} from './shared.ts';
