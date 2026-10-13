/**
 * Turning the paths, directories and globs given on the command line into a
 * list of feature files.
 */
import fs from 'node:fs';
import path from 'node:path';
import {uniq} from './util/collections.ts';
import {escapeGlob, globRoot, globStream, globSync, literalPath} from './util/glob.ts';

/** The ignore file looked for when `--ignore` is not given. */
export const DEFAULT_IGNORE_FILE_NAME = '.gurkencheckignore';

/** Never worth linting, and expensive to walk into. */
export const DEFAULT_IGNORED_PATTERNS = ['node_modules'];

export interface FeatureSearch {
  /** Matching feature files, relative to the working directory. */
  files: string[];
  /** Arguments that were neither a feature file, a directory nor a glob. */
  invalidPatterns: string[];
  /** Feature files named outright that the ignore patterns skip. */
  ignoredFiles: string[];
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
  /**
   * Feature files named outright that the ignore patterns skip.
   *
   * They stay skipped, so a list of changed files can be handed over whole,
   * but a file you asked for by name and did not get is worth a word: said
   * nothing about, it reads as a clean result.
   */
  ignoredFiles: string[];
}

/** The argument with forward slashes, whatever the platform writes. */
function toSlashes(pattern: string): string {
  return pattern.split(path.sep).join('/');
}

/**
 * Expands one command line argument into the globs to search, or `undefined`
 * when it does not name anything usable. Only feature files are kept from
 * what they match.
 *
 * Something that exists is taken as a name rather than as a glob, and
 * escaped, so a file or directory whose name holds glob characters - `[wip]`,
 * `{x}` - is still found, and a directory called `x.feature` is searched. A
 * name without glob syntax that does not exist is reported rather than
 * searched for: matching nothing, it would end in a clean run.
 *
 * Any other glob is searched as written, and the directories it matches are
 * searched as well, so `features/*`, `**` and `features/**\/` all mean what a
 * shell would make of them.
 */
function toFeatureGlobs(pattern: string): string[] | undefined {
  if (pattern === '.') {
    return ['**/*.feature'];
  }

  let stats: fs.Stats | undefined;
  try {
    stats = fs.statSync(pattern);
  } catch {
    stats = undefined;
  }
  if (stats?.isDirectory() === true) {
    return [`${escapeGlob(toSlashes(pattern)).replace(/\/+$/, '')}/**/*.feature`];
  }
  if (stats?.isFile() === true) {
    return isFeatureFile(pattern) ? [escapeGlob(toSlashes(pattern))] : undefined;
  }

  const glob = toSlashes(pattern).replace(/(?<=.)\/+$/, '');
  if (literalPath(glob) !== undefined) {
    return undefined;
  }
  if (isFeatureFile(glob)) {
    return [glob];
  }
  if (/(?:^|\/)\*\*$/.test(glob)) {
    return [`${glob}/*.feature`];
  }
  return [glob, `${glob}/**/*.feature`];
}

function isFeatureFile(name: string): boolean {
  return name.endsWith('.feature');
}

/** True when the argument names a feature file that the ignore patterns skip. */
function isIgnoredFile(pattern: string, globs: readonly string[], ignore: readonly string[]): boolean {
  const [featureGlob] = globs;
  if (globs.length !== 1 || !isFeatureFile(pattern) || literalPath(featureGlob!) === undefined) {
    return false;
  }
  return globSync(featureGlob!).length > 0 && globSync(featureGlob!, {ignore}).length === 0;
}

/**
 * Reads the ignore file, one glob pattern per line, ignoring blank lines.
 *
 * A list that comes to nothing - an ignore file holding only comments, or
 * `--ignore ''` - is the same as no list, so node_modules stays skipped. Taken
 * as an empty list, it would start linting every installed package.
 */
export function readIgnorePatterns(
  ignoreArgument: readonly string[] | undefined,
  ignoreFileName: string = DEFAULT_IGNORE_FILE_NAME,
): string[] {
  const given = ignoreArgument?.filter((pattern) => pattern.trim() !== '') ?? [];
  if (given.length > 0) {
    return given;
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

  const patterns = contents
    .replace(/^\uFEFF/u, '')
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
  return patterns.length > 0 ? patterns : [...DEFAULT_IGNORED_PATTERNS];
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
  const ignoredFiles: string[] = [];

  for (const pattern of searched) {
    const globs = toFeatureGlobs(pattern);
    if (globs === undefined) {
      invalidPatterns.push(pattern);
      continue;
    }
    if (isIgnoredFile(pattern, globs, ignore)) {
      ignoredFiles.push(pattern);
    }
    for (const featureGlob of globs) {
      files.push(...globSync(featureGlob, {ignore}).filter(isFeatureFile));
    }
  }

  return {files: uniq(files), invalidPatterns, ignoredFiles};
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
  const ignoredFiles: string[] = [];

  for (const pattern of searched) {
    const expanded = toFeatureGlobs(pattern);
    if (expanded === undefined) {
      invalidPatterns.push(pattern);
    } else {
      if (isIgnoredFile(pattern, expanded, ignore)) {
        ignoredFiles.push(pattern);
      }
      globs.push(...expanded);
    }
  }

  async function* files(): AsyncGenerator<string> {
    const seen = globs.length > 1 ? new Set<string>() : undefined;

    for (const featureGlob of globs) {
      for await (const file of globStream(featureGlob, {ignore})) {
        if (!isFeatureFile(file)) continue;
        if (seen !== undefined) {
          if (seen.has(file)) continue;
          seen.add(file);
        }
        yield file;
      }
    }
  }

  return {files: files(), invalidPatterns, ignoredFiles};
}

/**
 * The directories a set of patterns could draw feature files from.
 *
 * What to watch, in other words. A directory rather than the files
 * themselves, so that a file created after the run started is noticed too -
 * watching only what was found would never hear about anything new.
 *
 * A directory inside another one in the list is dropped: a recursive watch on
 * the parent already covers it, and two watches over one place would report
 * every change twice.
 */
export function featureRoots(patterns: readonly string[]): string[] {
  const searched = patterns.length > 0 ? patterns : ['.'];
  const roots = new Set<string>();

  for (const pattern of searched) {
    for (const featureGlob of toFeatureGlobs(pattern) ?? []) {
      roots.add(globRoot(featureGlob));
    }
  }

  // Shorter paths sort first, so a parent is always seen before its children.
  const sorted = [...roots].sort();
  const kept: string[] = [];
  for (const root of sorted) {
    const covered = kept.some(
      (parent) => root === parent || root.startsWith(`${parent}${path.sep}`),
    );
    if (!covered) {
      kept.push(root);
    }
  }
  return kept;
}
