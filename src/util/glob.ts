/**
 * A small glob implementation, replacing the `glob` package.
 *
 * Supports the subset of glob syntax that feature-file discovery needs:
 * `*`, `?`, `**`, character classes (`[abc]`, `[!abc]`), brace alternatives
 * (`{a,b}`) and backslash escapes.
 *
 * As with the `glob` package's defaults, `*` and `**` do not match entries
 * whose name starts with a dot, and symlinked directories are not traversed.
 */
import fs from 'node:fs';
import path from 'node:path';

const REGEXP_SPECIAL_CHARACTERS = new Set('.+^$()|\\'.split(''));

/**
 * Translates a glob pattern into an anchored regular expression matching
 * slash-separated paths.
 */
export function globToRegExp(pattern: string): RegExp {
  let source = '';
  let braceDepth = 0;
  let index = 0;

  while (index < pattern.length) {
    const character = pattern[index]!;

    if (character === '*') {
      const start = index;
      while (pattern[index] === '*') index++;

      const isGlobstar = index - start >= 2;
      const atSegmentStart = start === 0 || pattern[start - 1] === '/';
      const atSegmentEnd = index === pattern.length || pattern[index] === '/';

      if (isGlobstar && atSegmentStart && atSegmentEnd) {
        if (pattern[index] === '/') {
          // `**/` matches any number of leading path segments, including none.
          source += '(?:[^/]*/)*';
          index++;
        } else {
          source += '.*';
        }
      } else {
        // A `*` anywhere else matches within a single path segment.
        source += '[^/]*';
      }
      continue;
    }

    index++;

    if (character === '?') {
      source += '[^/]';
    } else if (character === '[') {
      const closing = findClosingBracket(pattern, index);
      if (closing === -1) {
        source += '\\[';
      } else {
        const negated = pattern[index] === '!' || pattern[index] === '^';
        const body = pattern.slice(negated ? index + 1 : index, closing);
        source += `[${negated ? '^' : ''}${body.replace(/\\/g, '\\\\')}]`;
        index = closing + 1;
      }
    } else if (character === '{') {
      braceDepth++;
      source += '(?:';
    } else if (character === '}' && braceDepth > 0) {
      braceDepth--;
      source += ')';
    } else if (character === ',' && braceDepth > 0) {
      source += '|';
    } else if (character === '\\' && index < pattern.length) {
      source += escapeLiteral(pattern[index]!);
      index++;
    } else {
      source += escapeLiteral(character);
    }
  }

  return new RegExp(`^${source}$`);
}

function escapeLiteral(character: string): string {
  return REGEXP_SPECIAL_CHARACTERS.has(character) ? `\\${character}` : character;
}

function findClosingBracket(pattern: string, from: number): number {
  for (let index = from + 1; index < pattern.length; index++) {
    if (pattern[index] === ']') return index;
  }
  return -1;
}

/** True when the segment contains glob syntax rather than a literal name. */
function isDynamic(segment: string): boolean {
  return /[*?[\]{}]/.test(segment);
}

/**
 * The leading run of literal segments, used as the directory to start walking
 * from so that `a/b/**` does not scan the whole tree.
 */
function staticPrefix(pattern: string): string {
  const segments = pattern.split('/');
  const literal: string[] = [];
  for (const segment of segments.slice(0, -1)) {
    if (isDynamic(segment)) break;
    literal.push(segment);
  }
  return literal.join('/');
}

function isHidden(name: string): boolean {
  return name.startsWith('.');
}

/**
 * Orders the entries of a directory so that walking depth-first reaches files
 * in the same order that sorting the finished paths would.
 *
 * Everything inside a directory `d` has a path starting `d/`, so `d` has to
 * be ordered as `d/` rather than as `d`. Otherwise a sibling file called
 * `d-1.feature` comes after the directory here and before it in a sorted
 * list, because `-` sorts before `/` - and a walk that hands files over as it
 * finds them would quietly report them in a different order from one that
 * collects and sorts.
 */
function byPathOrder(a: fs.Dirent, b: fs.Dirent): number {
  const left = a.isDirectory() ? `${a.name}/` : a.name;
  const right = b.isDirectory() ? `${b.name}/` : b.name;
  return left < right ? -1 : left > right ? 1 : 0;
}

function readEntries(directory: string): fs.Dirent[] {
  try {
    return fs.readdirSync(directory, {withFileTypes: true}).sort(byPathOrder);
  } catch {
    // A missing or unreadable directory simply contributes no matches.
    return [];
  }
}

function walk(directory: string, onFile: (absolutePath: string) => void): void {
  for (const entry of readEntries(directory)) {
    if (isHidden(entry.name)) {
      continue;
    }
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolutePath, onFile);
    } else if (entry.isFile()) {
      onFile(absolutePath);
    }
  }
}

/**
 * The same walk, handing each file over as it is reached.
 *
 * Each directory is still read synchronously. `fs.promises.readdir` was tried
 * and is about 40% slower over a tree of a couple of thousand directories -
 * a promise for each directory costs more than reading it does - and it
 * bought nothing, because the only thing waiting on this walk is the work
 * being fed by it. What matters is that the walk is no longer one long block:
 * it gives way at every file, and the reading and checking downstream happen
 * in the gaps.
 */
async function* walkStream(root: string): AsyncGenerator<string> {
  // An explicit stack rather than recursion: a recursive async generator
  // delegates through one `yield*` per level of nesting for every file it
  // hands over, so a deep tree pays for its depth on every single file.
  const stack = [{directory: root, entries: readEntries(root), index: 0}];

  while (stack.length > 0) {
    const top = stack[stack.length - 1]!;
    if (top.index >= top.entries.length) {
      stack.pop();
      continue;
    }

    const entry = top.entries[top.index++]!;
    if (isHidden(entry.name)) {
      continue;
    }

    const absolutePath = path.join(top.directory, entry.name);
    if (entry.isDirectory()) {
      // Pushed so that its contents come before the entries after it here,
      // which is what a depth-first walk means.
      stack.push({directory: absolutePath, entries: readEntries(absolutePath), index: 0});
    } else if (entry.isFile()) {
      yield absolutePath;
    }
  }
}

export interface GlobOptions {
  /** Directory that relative patterns and returned paths are relative to. */
  cwd?: string;
  /**
   * Patterns whose matches are dropped from the result. A pattern matching a
   * directory drops everything below it, as in .gitignore and .eslintignore.
   */
  ignore?: readonly string[];
}

/**
 * True when the path, or any directory leading to it, matches one of the
 * patterns.
 *
 * Testing the parent directories is what makes an entry like `build` or `o*e`
 * skip the whole directory rather than only a file of that exact name. Without
 * it an ignore file has to spell out `build/**` everywhere, which is not how
 * .gitignore or .eslintignore behave.
 */
function isIgnored(relativePath: string, ignores: readonly RegExp[]): boolean {
  if (ignores.length === 0) {
    return false;
  }
  const segments = relativePath.split('/');
  for (let depth = 1; depth <= segments.length; depth++) {
    const prefix = segments.slice(0, depth).join('/');
    if (ignores.some((ignore) => ignore.test(prefix))) {
      return true;
    }
  }
  return false;
}

/** Everything a pattern needs in order to judge one path, worked out once. */
interface Search {
  /** Where the walk starts, so `a/b/**` does not scan the whole tree. */
  searchRoot: string;
  /** The path to report, or `undefined` when this entry is not a match. */
  match(absolutePath: string): string | undefined;
}

function newSearch(pattern: string, options: GlobOptions): Search {
  const cwd = options.cwd ?? process.cwd();
  const normalisedPattern = pattern.split(path.sep).join('/');
  const matches = globToRegExp(normalisedPattern);
  const ignores = (options.ignore ?? []).map((ignorePattern) =>
    globToRegExp(ignorePattern.split(path.sep).join('/')),
  );

  // An absolute pattern is matched against absolute paths: comparing it with
  // a path relative to cwd can never match, and the search would come back
  // empty rather than wrong, which reads as "nothing to report".
  const absolutePattern = path.isAbsolute(normalisedPattern);

  return {
    searchRoot: path.resolve(cwd, staticPrefix(normalisedPattern)),
    match(absolutePath: string): string | undefined {
      const relativePath = path.relative(cwd, absolutePath).split(path.sep).join('/');
      const candidate = absolutePattern ? absolutePath.split(path.sep).join('/') : relativePath;
      if (!matches.test(candidate)) return undefined;
      if (isIgnored(relativePath, ignores)) return undefined;
      return relativePath;
    },
  };
}

/**
 * Returns the files matching `pattern`, as paths relative to `cwd` using
 * forward slashes. Directories are never returned. Results are sorted.
 */
export function globSync(pattern: string, options: GlobOptions = {}): string[] {
  const search = newSearch(pattern, options);
  const found: string[] = [];

  const consider = (absolutePath: string): void => {
    const relativePath = search.match(absolutePath);
    if (relativePath !== undefined) {
      found.push(relativePath);
    }
  };

  const stats = statOrUndefined(search.searchRoot);
  if (stats === undefined) {
    return [];
  }
  if (stats.isFile()) {
    consider(search.searchRoot);
  } else {
    walk(search.searchRoot, consider);
  }

  return found.sort();
}

/**
 * The same search, handing each match over as it is found.
 *
 * Collecting a whole tree before anything else starts is time in which
 * nothing is read, parsed or checked. This hands each match over as it is
 * reached, so the work after it starts on the first file rather than on the
 * last.
 *
 * The order is the order `globSync` returns, without anything being collected
 * to sort: `byPathOrder` is what makes the two agree.
 */
export async function* globStream(
  pattern: string,
  options: GlobOptions = {},
): AsyncGenerator<string> {
  const search = newSearch(pattern, options);

  const stats = statOrUndefined(search.searchRoot);
  if (stats === undefined) {
    return;
  }

  if (stats.isFile()) {
    const relativePath = search.match(search.searchRoot);
    if (relativePath !== undefined) {
      yield relativePath;
    }
    return;
  }

  for await (const absolutePath of walkStream(search.searchRoot)) {
    const relativePath = search.match(absolutePath);
    if (relativePath !== undefined) {
      yield relativePath;
    }
  }
}

function statOrUndefined(target: string): fs.Stats | undefined {
  try {
    return fs.statSync(target);
  } catch {
    return undefined;
  }
}
