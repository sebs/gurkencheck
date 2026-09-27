/**
 * Turning a parsed node's location into the position fields of a RuleError.
 */
import type {Location} from '@cucumber/messages';

/** The line and, when the parser recorded one, the column of a node. */
export function at(location: Location): {line: number; column?: number} {
  return location.column === undefined
    ? {line: location.line}
    : {line: location.line, column: location.column};
}

/**
 * The 1-based column of the character at `index` in `text`.
 *
 * The parser counts columns in characters, while a string index counts UTF-16
 * units, of which an emoji is two. A rule reading the raw text reports in the
 * parser's terms, so its columns agree with every other rule's.
 */
export function columnOf(text: string, index: number): number {
  return [...text.slice(0, index)].length + 1;
}

/** A position given as plain numbers, for rules working on raw text. */
export function atLineColumn(line: number, column?: number): {line: number; column?: number} {
  return column === undefined ? {line} : {line, column};
}
