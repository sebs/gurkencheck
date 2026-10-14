/**
 * Turning the paths, directories and globs given on the command line into a
 * list of feature files.
 */
import fs from 'node:fs';
import path from 'node:path';
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

/**
 * A path that exists, spelled as the disk spells it: on a file system that
 * ignores case, `features/LOGIN.feature` names `features/Login.feature`, and
 * reported as typed, file-name would judge a name the file does not have.
 * Only the case is put right; a symlink stays the name it was given.
 */
function onDiskSpelling(given: string): string {
  const absolute = path.resolve(given);
  const {root} = path.parse(absolute);
  let spelled = root;
  for (const segment of absolute.slice(root.length).split(path.sep).filter((part) => part !== '')) {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(spelled);
    } catch {
      return given;
    }
    const match = entries.includes(segment)
      ? segment
      : entries.find((entry) => entry.toLowerCase() === segment.toLowerCase());
    spelled = path.join(spelled, match ?? segment);
  }
  if (spelled === absolute) {
    return given;
  }
  return path.isAbsolute(given) ? spelled : path.relative(process.cwd(), spelled) || '.';
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
    return [`${escapeGlob(toSlashes(onDiskSpelling(pattern))).replace(/\/+$/, '')}/**/*.feature`];
  }
  if (stats?.isFile() === true) {
    const spelled = onDiskSpelling(pattern);
    return isFeatureFile(spelled) ? [escapeGlob(toSlashes(spelled))] : undefined;
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

/**
 * What makes two paths the same file: where they lead, in the case the disk
 * has it in. `a.feature` and `A.feature` on a file system that ignores case,
 * or a file and a symlink to it, are one file and should be checked once.
 */
function identityOf(file: string): string {
  try {
    return fs.realpathSync.native(file);
  } catch {
    return path.resolve(file);
  }
}

/** The files with any repeat of one already listed left out, in order. */
function withoutRepeats(files: readonly string[]): string[] {
  const seen = new Set<string>();
  return files.filter((file) => {
    const identity = identityOf(file);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

/**
 * Why an argument the search refused names nothing to check, in a sentence.
 *
 * Only a name can be refused - any glob is searched - and a name is refused
 * for one of three reasons, each with its own remedy. Calling all three an
 * invalid format sent you looking at the spelling of a file that was there.
 */
export function describeInvalidPattern(pattern: string): string {
  let stats: fs.Stats | undefined;
  try {
    stats = fs.statSync(pattern);
  } catch {
    return `"${pattern}" does not exist.`;
  }
  if (stats.isFile()) {
    return `"${pattern}" is not a .feature file.`;
  }
  return `"${pattern}" is neither a file nor a directory.`;
}

/** True when the argument names a feature file that the ignore patterns skip. */
function isIgnoredFile(pattern: string, globs: readonly string[], ignore: IgnoreList): boolean {
  const [featureGlob] = globs;
  if (globs.length !== 1 || !isFeatureFile(pattern) || literalPath(featureGlob!) === undefined) {
    return false;
  }
  return (
    globSync(featureGlob!).length > 0 &&
    globSync(featureGlob!, {ignore: ignore.patterns, ignoreBase: ignore.base}).length === 0
  );
}

/**
 * The ignore file a run with no --ignore uses: the nearest
 * `.gurkencheckignore` in the working directory or any directory above it,
 * or `undefined` when there is none - found the way the configuration is, so
 * that running from a subdirectory of a project skips what the project
 * skips.
 */
export function findIgnoreFile(cwd: string = process.cwd()): string | undefined {
  let directory = path.resolve(cwd);
  for (;;) {
    const candidate = path.join(directory, DEFAULT_IGNORE_FILE_NAME);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;
  }
}

/** Ignore patterns, and the directory they are relative to. */
interface IgnoreList {
  patterns: string[];
  base: string;
}

/**
 * The patterns a run skips: --ignore's, relative to the working directory, or
 * the nearest ignore file's, relative to where it is.
 */
function readIgnoreList(ignoreArgument: readonly string[] | undefined): IgnoreList {
  const given = ignoreArgument?.filter((pattern) => pattern.trim() !== '') ?? [];
  const file = given.length > 0 ? undefined : findIgnoreFile();
  return {
    patterns: readIgnorePatterns(ignoreArgument, file ?? DEFAULT_IGNORE_FILE_NAME),
    base: file === undefined ? process.cwd() : path.dirname(file),
  };
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
  ignoreFileName: string = findIgnoreFile() ?? DEFAULT_IGNORE_FILE_NAME,
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
  const ignore = readIgnoreList(ignoreArgument);

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
      files.push(
        ...globSync(featureGlob, {ignore: ignore.patterns, ignoreBase: ignore.base}).filter(isFeatureFile),
      );
    }
  }

  return {files: withoutRepeats(files), invalidPatterns, ignoredFiles};
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
  const ignore = readIgnoreList(ignoreArgument);

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
      for await (const file of globStream(featureGlob, {ignore: ignore.patterns, ignoreBase: ignore.base})) {
        if (!isFeatureFile(file)) continue;
        if (seen !== undefined) {
          const identity = identityOf(file);
          if (seen.has(identity)) continue;
          seen.add(identity);
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
