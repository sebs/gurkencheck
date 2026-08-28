/**
 * Statistics: what is in a set of feature files, rather than what is wrong
 * with them.
 *
 * ```ts
 * import {collectStatistics, readAndParseFile, toText} from 'gurkencheck';
 *
 * const parsed = await Promise.all(files.map((file) => readAndParseFile(file)));
 * console.log(toText(collectStatistics(parsed), {top: 10}));
 * ```
 */
export {collectStatistics, distribution} from './collect.ts';
export type {CollectOptions} from './collect.ts';
export {DEFAULT_SIMILARITY, boundedEditDistance, groupSimilar} from './similar.ts';
export type {SimilarityOptions} from './similar.ts';
export {
  NUMBER_MARKER,
  PLACEHOLDER_MARKER,
  STRING_MARKER,
  countWords,
  normaliseStepText,
} from './normalise.ts';
export {
  DEFAULT_STATS_FORMAT,
  DEFAULT_TOP,
  STATS_FORMATTERS,
  getStatsFormatter,
  toJson as statisticsToJson,
  toMarkdown,
  toText,
} from './format/index.ts';
export type {StatsFormatOptions, StatsFormatter} from './format/index.ts';
export {runStats, statsUsage} from './command.ts';
export type * from './types.ts';
