/**
 * Helpers for looking at a feature file as plain text.
 */
import type {Feature} from '@cucumber/messages';
import {stepContainersOf} from '../gherkin/traverse.ts';
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

/** What part of a doc string a line is, if it is part of one. */
export type DocStringPart = 'delimiter' | 'content' | undefined;

/**
 * Says of each line whether it opens or closes a doc string, sits inside one,
 * or neither.
 *
 * Text inside a doc string is data belonging to the step, not part of the
 * layout of the file, so rules about formatting have to leave it alone - but
 * its delimiters are layout like any other line. Which is which is taken from
 * where the parser found them, not from how a line starts: a Markdown doc
 * string between """ may well hold lines starting with ```.
 *
 * Given the parsed document, the doc strings are taken from it, which is
 * exact. Without one - a file the parser rejected - the raw lines are read
 * instead, and a line opening with a delimiter is taken to open a doc
 * string, which a description line starting with `"""` also does.
 */
export function docStringParts(lines: readonly string[], feature?: Feature): DocStringPart[] {
  const parts = new Array<DocStringPart>(lines.length).fill(undefined);

  if (feature !== undefined) {
    for (const {node} of stepContainersOf(feature)) {
      for (const step of node.steps) {
        if (step.docString === undefined) continue;
        const {location, delimiter} = step.docString;
        // The closing delimiter is the next line that starts with the one
        // that opened it. Counting the content's lines instead goes wrong for
        // content of one blank or whitespace line, which the parser hands
        // over as no content at all.
        let last = location.line + 1;
        while (last <= lines.length && !(lines[last - 1] ?? '').trimStart().startsWith(delimiter)) {
          last++;
        }
        for (let line = location.line; line <= last && line <= lines.length; line++) {
          parts[line - 1] = line === location.line || line === last ? 'delimiter' : 'content';
        }
      }
    }
    return parts;
  }

  let openDelimiter: string | undefined;

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (openDelimiter === undefined) {
      // An opening delimiter may be followed by a content type, e.g. """json
      const delimiter = DOC_STRING_DELIMITERS.find((candidate) => trimmed.startsWith(candidate));
      if (delimiter !== undefined) {
        openDelimiter = delimiter;
        parts[index] = 'delimiter';
      }
      return;
    }

    if (trimmed.startsWith(openDelimiter)) {
      openDelimiter = undefined;
      parts[index] = 'delimiter';
    } else {
      parts[index] = 'content';
    }
  });

  return parts;
}

/** Marks which lines sit inside a doc string, delimiters included. */
export function markDocStrings(lines: readonly string[], feature?: Feature): boolean[] {
  return docStringParts(lines, feature).map((part) => part !== undefined);
}
