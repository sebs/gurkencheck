/**
 * Output formats.
 */
import type {FileResult} from '../types.ts';
import {printResults as json} from './json.ts';
import {printResults as stylish} from './stylish.ts';
import {printResults as xunit} from './xunit.ts';

export type Formatter = (results: readonly FileResult[]) => void;

/** The formats accepted by `--format`. */
export const FORMATTERS: Record<string, Formatter> = {stylish, json, xunit};

export const DEFAULT_FORMAT = 'stylish';

/** The formatter for a format name, or `undefined` when it is not a format. */
export function getFormatter(format: string | undefined): Formatter | undefined {
  return FORMATTERS[format ?? DEFAULT_FORMAT];
}
