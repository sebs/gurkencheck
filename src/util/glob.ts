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

function walk(directory: string, onFile: (absolutePath: string) => void): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, {withFileTypes: true});
  } catch {
    // A missing or unreadable directory simply contributes no matches.
    return;
  }

  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
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

/**
 * Returns the files matching `pattern`, as paths relative to `cwd` using
 * forward slashes. Directories are never returned. Results are sorted.
 */
export function globSync(pattern: string, options: GlobOptions = {}): string[] {
  const cwd = options.cwd ?? process.cwd();
  const normalisedPattern = pattern.split(path.sep).join('/');
  const matches = globToRegExp(normalisedPattern);
  const ignores = (options.ignore ?? []).map((ignorePattern) =>
    globToRegExp(ignorePattern.split(path.sep).join('/')),
  );

  const searchRoot = path.resolve(cwd, staticPrefix(normalisedPattern));
  const found: string[] = [];

  const consider = (absolutePath: string): void => {
    const relativePath = path.relative(cwd, absolutePath).split(path.sep).join('/');
    if (!matches.test(relativePath)) return;
    if (isIgnored(relativePath, ignores)) return;
    found.push(relativePath);
  };

  const stats = statOrUndefined(searchRoot);
  if (stats === undefined) {
    return [];
  }
  if (stats.isFile()) {
    consider(searchRoot);
  } else {
    walk(searchRoot, consider);
  }

  return found.sort();
}

function statOrUndefined(target: string): fs.Stats | undefined {
  try {
    return fs.statSync(target);
  } catch {
    return undefined;
  }
}
