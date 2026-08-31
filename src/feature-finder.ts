/**
 * Turning the paths, directories and globs given on the command line into a
 * list of feature files.
 */
import fs from 'node:fs';
import path from 'node:path';
import {uniq} from './util/collections.ts';
import {globStream, globSync} from './util/glob.ts';

/** The ignore file looked for when `--ignore` is not given. */
export const DEFAULT_IGNORE_FILE_NAME = '.gurkencheckignore';

/** Never worth linting, and expensive to walk into. */
export const DEFAULT_IGNORED_PATTERNS = ['node_modules/**'];

export interface FeatureSearch {
  /** Matching feature files, relative to the working directory. */
  files: string[];
  /** Arguments that were neither a feature file, a directory nor a glob. */
  invalidPatterns: string[];
}

export interface FeatureFileStream {
  /**
   * Matching feature files, found as the walk reaches them, in the order
   * `findFeatureFiles` returns them in.
   */
  files: AsyncGenerator<string>;
  /**
   * Arguments that were neither a feature file, a directory nor a glob.
   *
   * Known before anything is walked, so a caller can give up on a bad
   * argument without having searched for the good ones.
   */
  invalidPatterns: string[];
}

/**
 * Expands one command line argument into a glob that only matches feature
 * files, or `undefined` when it does not name anything usable.
 */
function toFeatureGlob(pattern: string): string | undefined {
  if (pattern === '.') {
    return '**/*.feature';
  }
  if (/\/\*\*$/.test(pattern)) {
    return `${pattern}/*.feature`;
  }
  if (pattern.endsWith('.feature')) {
    return pattern;
  }
  try {
    if (fs.statSync(pattern).isDirectory()) {
      return path.join(pattern, '**/*.feature').split(path.sep).join('/');
    }
  } catch {
    // Reported by the caller as an invalid pattern.
  }
  return undefined;
}

/** Reads the ignore file, one glob pattern per line, ignoring blank lines. */
export function readIgnorePatterns(
  ignoreArgument: readonly string[] | undefined,
  ignoreFileName: string = DEFAULT_IGNORE_FILE_NAME,
): string[] {
  if (ignoreArgument !== undefined && ignoreArgument.length > 0) {
    return [...ignoreArgument];
  }

  let contents: string;
  try {
    contents = fs.readFileSync(ignoreFileName, 'utf8');
  } catch {
    // No ignore file, or one that cannot be read: fall back to the defaults
    // rather than stopping the run, so that node_modules stays skipped either
    // way. Reading it outright rather than checking that it exists first also
    // closes the gap between the two, in which it can be moved or removed.
    return [...DEFAULT_IGNORED_PATTERNS];
  }

  return contents
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

/**
 * Finds the feature files named by the given patterns. With no patterns, the
 * working directory is searched recursively.
 */
export function findFeatureFiles(
  patterns: readonly string[],
  ignoreArgument?: readonly string[],
): FeatureSearch {
  const searched = patterns.length > 0 ? patterns : ['.'];
  const ignore = readIgnorePatterns(ignoreArgument);

  const files: string[] = [];
  const invalidPatterns: string[] = [];

  for (const pattern of searched) {
    const featureGlob = toFeatureGlob(pattern);
    if (featureGlob === undefined) {
      invalidPatterns.push(pattern);
      continue;
    }
    files.push(...globSync(featureGlob, {ignore}));
  }

  return {files: uniq(files), invalidPatterns};
}

/**
 * The same search, handing each file over as it is found.
 *
 * Walking a large tree to the end before anything else starts is time in
 * which nothing is read, parsed or checked. Handing files over as they turn
 * up lets the rest of the work begin on the first one.
 *
 * Only a run given more than one pattern remembers what it has already
 * handed over: one walk cannot reach the same file twice, and remembering is
 * what a stream is trying to avoid.
 */
export function findFeatureFileStream(
  patterns: readonly string[],
  ignoreArgument?: readonly string[],
): FeatureFileStream {
  const searched = patterns.length > 0 ? patterns : ['.'];
  const ignore = readIgnorePatterns(ignoreArgument);

  const globs: string[] = [];
  const invalidPatterns: string[] = [];

  for (const pattern of searched) {
    const featureGlob = toFeatureGlob(pattern);
    if (featureGlob === undefined) {
      invalidPatterns.push(pattern);
    } else {
      globs.push(featureGlob);
    }
  }

  async function* files(): AsyncGenerator<string> {
    const seen = globs.length > 1 ? new Set<string>() : undefined;

    for (const featureGlob of globs) {
      for await (const file of globStream(featureGlob, {ignore})) {
        if (seen !== undefined) {
          if (seen.has(file)) continue;
          seen.add(file);
        }
        yield file;
      }
    }
  }

  return {files: files(), invalidPatterns};
}
