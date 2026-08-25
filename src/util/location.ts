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

/** A position given as plain numbers, for rules working on raw text. */
export function atLineColumn(line: number, column?: number): {line: number; column?: number} {
  return column === undefined ? {line} : {line, column};
}
