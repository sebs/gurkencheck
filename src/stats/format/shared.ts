/**
 * The bits of formatting the reports have in common.
 */
import type {Distribution} from '../types.ts';

/** How many entries a list in a report shows before it is cut short. */
export const DEFAULT_TOP = 10;

/** What a report needs to know beyond the numbers themselves. */
export interface StatsFormatOptions {
  /** How many entries each list shows. */
  top: number;
}

/** `64%`, and `0%` rather than `NaN%` when there is nothing to divide. */
export function percent(part: number, whole: number): string {
  return `${whole === 0 ? 0 : Math.round((part / whole) * 100)}%`;
}

/** A number with one decimal, and none at all when it is a round one. */
export function decimal(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** `min 1  median 5  p90 11  max 27  mean 5.5` */
export function summarise(distribution: Distribution): string {
  const {min, median, p90, max, mean} = distribution;
  return `min ${min}   median ${median}   p90 ${p90}   max ${max}   mean ${decimal(mean)}`;
}

/** `features/login.feature:12` */
export function location(file: string, line: number): string {
  return `${file}:${line}`;
}

/** `1 file` / `3 files` */
export function plural(count: number, singular: string, many = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : many}`;
}

/**
 * The first `top` entries, and how many were left out.
 *
 * Every list in a report is the head of a longer one, and a reader who is not
 * told that draws conclusions from a list they think is complete.
 */
export function head<T>(values: readonly T[], top: number): {shown: T[]; hidden: number} {
  return {shown: values.slice(0, top), hidden: Math.max(0, values.length - top)};
}
