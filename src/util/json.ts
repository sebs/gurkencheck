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
