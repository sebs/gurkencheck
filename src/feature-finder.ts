/**
 * Turning the paths, directories and globs given on the command line into a
 * list of feature files.
 */
import fs from 'node:fs';
import path from 'node:path';
import {uniq} from './util/collections.ts';
import {globSync} from './util/glob.ts';

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
  if (fs.existsSync(ignoreFileName)) {
    return fs
      .readFileSync(ignoreFileName, 'utf8')
      .split(/\r\n|\r|\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'));
  }
  return [...DEFAULT_IGNORED_PATTERNS];
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
