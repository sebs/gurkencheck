/**
 * JSON with comments, replacing the `strip-json-comments` package.
 */

/**
 * Blanks out `//` and comments from a JSON document, leaving
 * everything else - including string contents and line breaks - untouched.
 *
 * Comments are replaced by spaces rather than removed so that the character
 * offsets in any `JSON.parse` error still point at the right place.
 */
export function stripJsonComments(json: string): string {
  let result = '';
  let index = 0;
  let inString = false;

  while (index < json.length) {
    const character = json[index]!;
    const next = json[index + 1];

    if (inString) {
      result += character;
      if (character === '\\' && index + 1 < json.length) {
        result += json[index + 1];
        index += 2;
        continue;
      }
      if (character === '"') {
        inString = false;
      }
      index++;
      continue;
    }

    if (character === '"') {
      inString = true;
      result += character;
      index++;
      continue;
    }

    if (character === '/' && next === '/') {
      while (index < json.length && json[index] !== '\n') {
        result += ' ';
        index++;
      }
      continue;
    }

    if (character === '/' && next === '*') {
      const end = json.indexOf('*/', index + 2);
      const stop = end === -1 ? json.length : end + 2;
      while (index < stop) {
        // Keep line breaks so reported line numbers stay accurate.
        result += json[index] === '\n' ? '\n' : ' ';
        index++;
      }
      continue;
    }

    result += character;
    index++;
  }

  return result;
}

/**
 * Blanks out a comma left before a closing `}` or `]`, which JSON with
 * comments allows - the README's examples are `jsonc`, and an editor treating
 * the file that way will not flag one. Run after the comments are gone, so a
 * comment between the comma and the bracket does not hide it.
 */
export function stripTrailingCommas(json: string): string {
  let result = '';
  let inString = false;

  for (let index = 0; index < json.length; index++) {
    const character = json[index]!;
    if (inString) {
      result += character;
      if (character === '\\' && index + 1 < json.length) {
        result += json[++index];
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === ',' && closesNext(json, index + 1)) {
      result += ' ';
      continue;
    }
    result += character;
  }

  return result;
}

/** True when the next character after whitespace from `from` is `}` or `]`. */
function closesNext(json: string, from: number): boolean {
  for (let index = from; index < json.length; index++) {
    const character = json[index]!;
    if (character === '}' || character === ']') return true;
    if (!/\s/u.test(character)) return false;
  }
  return false;
}

/** Parses JSON that may contain comments and trailing commas. */
export function parseJsonWithComments(json: string): unknown {
  return JSON.parse(stripTrailingCommas(stripJsonComments(json)));
}

/**
 * The keys a JSON document gives twice in one object, in the order the second
 * of each is met. JSON.parse keeps the last of them without a word - and a
 * configuration listing extends twice silently dropped the first base.
 *
 * A scan of the text, after comments are blanked: strings are read whole, so
 * a brace or a colon inside one changes nothing, and each object's keys are
 * kept on a stack of their own.
 */
export function duplicateKeys(json: string): string[] {
  const duplicates: string[] = [];
  /** For each object or array open: its keys, or undefined for an array. */
  const open: (Set<string> | undefined)[] = [];
  let lastString: string | undefined;

  for (let index = 0; index < json.length; index++) {
    const character = json[index]!;
    if (character === '"') {
      let end = index + 1;
      while (end < json.length && json[end] !== '"') {
        end += json[end] === '\\' ? 2 : 1;
      }
      try {
        lastString = JSON.parse(json.slice(index, end + 1)) as string;
      } catch {
        lastString = json.slice(index + 1, end);
      }
      index = end;
      continue;
    }
    if (character === '{') {
      open.push(new Set());
    } else if (character === '[') {
      open.push(undefined);
    } else if (character === '}' || character === ']') {
      open.pop();
    } else if (character === ':') {
      const keys = open.at(-1);
      if (keys !== undefined && lastString !== undefined) {
        if (keys.has(lastString)) {
          duplicates.push(lastString);
        }
        keys.add(lastString);
      }
    }
    if (!/\s/u.test(character) && character !== ':') {
      lastString = undefined;
    }
  }
  return duplicates;
}

/** How much of a value a message quotes before cutting it short. */
const QUOTED_LENGTH = 80;

/**
 * A value from a configuration as a message quotes it: as JSON - with
 * Infinity and NaN as themselves rather than null - cut short past a few dozen
 * characters, so a long list given where a number belongs does not become a
 * message hundreds of kilobytes long.
 */
export function quoteValue(value: unknown): string {
  const text = typeof value === 'number' ? String(value) : (JSON.stringify(value) ?? String(value));
  return [...text].length <= QUOTED_LENGTH ? text : `${[...text].slice(0, QUOTED_LENGTH - 1).join('')}…`;
}
