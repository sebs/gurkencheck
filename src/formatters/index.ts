/**
 * Output formats.
 */
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import type {FileResult} from '../types.ts';
import {printResults as json} from './json.ts';
import {printResults as junit} from './junit.ts';
import {printResults as sarif} from './sarif.ts';
import {printResults as stylish, startRun as streamStylish} from './stylish.ts';
import {printResults as tap, startRun as streamTap} from './tap.ts';
import {resolvePackage} from '../util/resolve.ts';

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
export const FORMATTERS: Record<string, Formatter> = {
  stylish,
  json,
  junit,
  sarif,
  tap,
  // The name the JUnit report used to go by.
  xunit: junit,
};

export const DEFAULT_FORMAT = 'stylish';

/**
 * A formatter writing as the results arrive, rather than once they are all
 * in.
 *
 * Text comes back written verbatim, line breaks included, so a formatter says
 * exactly what goes on the stream. `start` and `end` are optional: a format
 * with no preamble and no trailer needs neither.
 */
export interface FormatterRun {
  /** Written before the first result. */
  start?(): string;
  /** Written for one file, as soon as that file is done. */
  file(result: FileResult): string;
  /** Written after the last result. */
  end?(): string;
}

/**
 * Starts one run of a streaming formatter.
 *
 * A factory rather than an object, so counters and the like belong to a run
 * and two at once cannot tread on each other.
 */
export type StreamingFormatter = () => FormatterRun;

/**
 * The formats that can be written as the run goes on.
 *
 * Not every format can. json, sarif and junit are each a single document with
 * a root element and counts over the whole run, so there is nothing to write
 * until the run is over; they stay as they are rather than being bent into a
 * shape that does not suit them.
 */
export const STREAMING_FORMATTERS: Record<string, StreamingFormatter> = {
  stylish: streamStylish,
  tap: streamTap,
};

/** The streaming formatter for a format name, when that format has one. */
export function getStreamingFormatter(
  format: string | undefined,
): StreamingFormatter | undefined {
  return STREAMING_FORMATTERS[format ?? DEFAULT_FORMAT];
}

/**
 * The streaming formatter for a name, a path or a package, when there is one.
 *
 * A formatter of your own joins in by exporting `startRun`, a function
 * returning `{start?, file, end?}`. Without one it is used as it always was,
 * with the whole run at once.
 */
export async function loadStreamingFormatter(
  format: string | undefined,
  cwd: string = process.cwd(),
): Promise<StreamingFormatter | undefined> {
  const builtIn = getStreamingFormatter(format);
  if (builtIn !== undefined || getFormatter(format) !== undefined) {
    return builtIn;
  }

  const module = await loadFormatterModule(format!, cwd);
  for (const exported of exportsOf(module)) {
    const startRun = exported['startRun'];
    if (typeof startRun === 'function') {
      return startRun as StreamingFormatter;
    }
  }
  return undefined;
}

/** The formatter for a built-in format name, or `undefined` for anything else. */
export function getFormatter(format: string | undefined): Formatter | undefined {
  return FORMATTERS[format ?? DEFAULT_FORMAT];
}

function asFormatter(candidate: unknown): Formatter | undefined {
  return typeof candidate === 'function' ? (candidate as Formatter) : undefined;
}

/**
 * The objects a formatter's exports may sit on: the module, its default
 * export, and that export's own `default`.
 *
 * The last is what tsc and Babel make of `export default` when they compile
 * to CommonJS - `exports.default = ...`, which `import` then hands over as
 * the module's default - and a default export may as well be an object
 * holding `printResults` as the function itself.
 */
function exportsOf(module: Record<string, unknown>): Record<string, unknown>[] {
  const found = [module];
  let candidate = module['default'];
  for (let depth = 0; depth < 2; depth++) {
    if (typeof candidate !== 'object' || candidate === null) {
      break;
    }
    found.push(candidate as Record<string, unknown>);
    candidate = (candidate as Record<string, unknown>)['default'];
  }
  return found;
}

/**
 * Loads the module behind a format that is not a built-in name, resolved from
 * `cwd` so that a formatter installed in the project is found and a relative
 * path means what it looks like.
 */
async function loadFormatterModule(
  specifier: string,
  cwd: string,
): Promise<Record<string, unknown>> {
  const from = path.join(path.resolve(cwd), 'noop.js');

  let resolved: string;
  if (specifier.startsWith('.') || path.isAbsolute(specifier)) {
    resolved = path.resolve(cwd, specifier);
  } else {
    try {
      resolved = resolvePackage(specifier, from);
    } catch {
      // `fmt/count.mjs` is as likely a path as a package, and a path does not
      // have to start with ./ to be one.
      const asPath = path.resolve(cwd, specifier);
      if (fs.existsSync(asPath)) {
        return await importFormatter(asPath, specifier);
      }
      throw new Error(
        `Unsupported format "${specifier}". Use one of ${Object.keys(FORMATTERS).join(', ')}, ` +
          'or the path to a formatter of your own.',
      );
    }
  }

  return await importFormatter(resolved, specifier);
}

async function importFormatter(
  resolved: string,
  specifier: string,
): Promise<Record<string, unknown>> {
  try {
    return (await import(pathToFileURL(resolved).href)) as Record<string, unknown>;
  } catch (thrown) {
    throw new Error(
      `Could not load the formatter "${specifier}": ${thrown instanceof Error ? thrown.message : String(thrown)}`,
    );
  }
}

/**
 * The formatter for a format name, a path, or a package.
 *
 * The module may export the formatter as its default export, as
 * `printResults`, or be the function itself - or hold either on its default
 * export, as compiled TypeScript does.
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
  const module = await loadFormatterModule(specifier, cwd);

  let formatter: Formatter | undefined;
  for (const exported of exportsOf(module)) {
    formatter ??= asFormatter(exported['default']) ?? asFormatter(exported['printResults']);
  }
  formatter ??= asFormatter(module);
  if (formatter === undefined) {
    throw new Error(
      `"${specifier}" does not export a formatter. A formatter module exports a function taking the results.`,
    );
  }
  return formatter;
}
