/**
 * Helpers for looking at a feature file as plain text.
 */
import type {FeatureFile} from '../types.ts';

/**
 * The lines a person would see in their editor.
 *
 * Splitting on line breaks leaves a trailing empty entry when the file ends
 * with one, which is how `new-line-at-eof` detects that newline. That entry is
 * not a line of the file though, so any rule reporting a line number has to
 * leave it out or it points past the end of the file.
 */
export function contentLines(file: FeatureFile): string[] {
  const {lines} = file;
  return lines.at(-1) === '' ? lines.slice(0, -1) : [...lines];
}

/** The delimiters that open and close a doc string. */
const DOC_STRING_DELIMITERS = ['"""', '```'];

/**
 * Marks which lines sit inside a doc string, delimiters included.
 *
 * Text inside a doc string is data belonging to the step, not part of the
 * layout of the file, so rules about formatting have to leave it alone.
 *
 * This reads the raw lines rather than the parsed document so that it still
 * works on a file the parser rejected.
 */
export function markDocStrings(lines: readonly string[]): boolean[] {
  const inside = new Array<boolean>(lines.length).fill(false);
  let openDelimiter: string | undefined;

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (openDelimiter === undefined) {
      // An opening delimiter may be followed by a content type, e.g. """json
      const delimiter = DOC_STRING_DELIMITERS.find((candidate) => trimmed.startsWith(candidate));
      if (delimiter !== undefined) {
        openDelimiter = delimiter;
        inside[index] = true;
      }
      return;
    }

    inside[index] = true;
    if (trimmed.startsWith(openDelimiter)) {
      openDelimiter = undefined;
    }
  });

  return inside;
}
