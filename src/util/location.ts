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
 * The position of a table cell, with its column in characters.
 *
 * The parser counts a cell's column in UTF-16 units, unlike the columns of
 * everything else, so every emoji before it in its row moved it one further
 * right. Given the file's lines, the column is counted again in characters;
 * without them it is left as the parser gave it.
 */
export function cellAt(location: Location, lines?: readonly string[]): {line: number; column?: number} {
  const line = lines?.[location.line - 1];
  if (location.column === undefined || line === undefined) {
    return at(location);
  }
  return {line: location.line, column: columnOf(line, location.column - 1)};
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
