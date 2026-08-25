/**
 * Output formats.
 */
import {createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import type {FileResult} from '../types.ts';
import {printResults as json} from './json.ts';
import {printResults as stylish} from './stylish.ts';
import {printResults as xunit} from './xunit.ts';

/**
 * Turns results into output.
 *
 * A formatter may print the output itself, or return it as a string and let
 * the caller print it. Returning a string is usually easier to test.
 */
export type Formatter = (
  results: readonly FileResult[],
) => void | string | Promise<void | string>;

/** The formats accepted by `--format` without having to be loaded. */
export const FORMATTERS: Record<string, Formatter> = {stylish, json, xunit};

export const DEFAULT_FORMAT = 'stylish';

/** The formatter for a built-in format name, or `undefined` for anything else. */
export function getFormatter(format: string | undefined): Formatter | undefined {
  return FORMATTERS[format ?? DEFAULT_FORMAT];
}

function asFormatter(candidate: unknown): Formatter | undefined {
  return typeof candidate === 'function' ? (candidate as Formatter) : undefined;
}

/**
 * The formatter for a format name, a path, or a package.
 *
 * Anything that is not a built-in name is loaded as a module, resolved from
 * `cwd` so that a formatter installed in the project is found and a relative
 * path means what it looks like. The module may export the formatter as its
 * default export, as `printResults`, or be the function itself.
 */
export async function loadFormatter(
  format: string | undefined,
  cwd: string = process.cwd(),
): Promise<Formatter> {
  const builtIn = getFormatter(format);
  if (builtIn !== undefined) {
    return builtIn;
  }

  const specifier = format!;
  const from = path.join(path.resolve(cwd), 'noop.js');

  let resolved: string;
  if (specifier.startsWith('.') || path.isAbsolute(specifier)) {
    resolved = path.resolve(cwd, specifier);
  } else {
    try {
      resolved = createRequire(pathToFileURL(from)).resolve(specifier);
    } catch {
      throw new Error(
        `Unsupported format "${specifier}". Use one of ${Object.keys(FORMATTERS).join(', ')}, ` +
          'or the path to a formatter of your own.',
      );
    }
  }

  let module: Record<string, unknown>;
  try {
    module = (await import(pathToFileURL(resolved).href)) as Record<string, unknown>;
  } catch (thrown) {
    throw new Error(
      `Could not load the formatter "${specifier}": ${thrown instanceof Error ? thrown.message : String(thrown)}`,
    );
  }

  const formatter =
    asFormatter(module['default']) ?? asFormatter(module['printResults']) ?? asFormatter(module);
  if (formatter === undefined) {
    throw new Error(
      `"${specifier}" does not export a formatter. A formatter module exports a function taking the results.`,
    );
  }
  return formatter;
}
