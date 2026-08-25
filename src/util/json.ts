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

/** Parses JSON that may contain comments. */
export function parseJsonWithComments(json: string): unknown {
  return JSON.parse(stripJsonComments(json));
}
