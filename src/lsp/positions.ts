/**
 * Where a finding sits, in the terms an editor uses.
 *
 * gurkencheck counts lines and columns from 1, and columns in characters -
 * code points - as a person counting along the line would. The protocol
 * counts both from 0, and columns in UTF-16 code units. The two agree until
 * a line holds an emoji or a character outside the Basic Multilingual Plane;
 * from there on, every column after it would be one out per such character.
 */
import type {RuleError} from '../types.ts';
import {DiagnosticSeverity} from './protocol.ts';
import type {Diagnostic, Range} from './protocol.ts';

/** Where a rule's documentation is, for a link from the editor. */
const RULE_DOCUMENTATION = 'https://sebs.maschinenlesbar.org/gurkencheck/rules/';

/** The UTF-16 offset of a 1-based code point column in a line. */
export function toCharacter(text: string, column: number): number {
  let offset = 0;
  let counted = 1;
  for (const character of text) {
    if (counted >= column) break;
    offset += character.length;
    counted++;
  }
  return offset;
}

/** The UTF-16 offset of the first character that is not white space. */
function firstNonBlank(text: string): number {
  const match = /\S/u.exec(text);
  return match === null ? 0 : match.index;
}

/** The UTF-16 offset just past the last character that is not white space. */
function endOfContent(text: string): number {
  return text.trimEnd().length;
}

/**
 * The stretch of text a finding marks.
 *
 * A finding names a line, and sometimes a column, but never an end. It is
 * marked from its column to the end of the line, which covers the name, tag
 * or step it is about; without a column, the line's content without the
 * indentation; about the whole file - line 0 - the first line. A finding
 * past the last line - the parser saying the file ended too early - goes on
 * the last one.
 */
export function rangeOf(error: Pick<RuleError, 'line' | 'column'>, lines: readonly string[]): Range {
  const last = Math.max(0, lines.length - 1);
  const line = error.line <= 0 ? 0 : Math.min(error.line - 1, last);
  const text = lines[line] ?? '';

  if (error.line <= 0) {
    return {start: {line, character: 0}, end: {line, character: endOfContent(text)}};
  }
  if (error.column !== undefined && error.column > 0) {
    const start = toCharacter(text, error.column);
    const content = endOfContent(text);
    // Past the content - trailing spaces, say - the rest of the line is what
    // the finding is about.
    const end = start >= content ? text.length : content;
    return {start: {line, character: start}, end: {line, character: Math.max(start, end)}};
  }
  const start = firstNonBlank(text);
  return {start: {line, character: start}, end: {line, character: Math.max(start, endOfContent(text))}};
}

/** True when a rule is one gurkencheck documents on its site. */
export type IsDocumented = (rule: string) => boolean;

/** A finding as an editor shows it. */
export function toDiagnostic(error: RuleError, lines: readonly string[], isDocumented: IsDocumented): Diagnostic {
  return {
    range: rangeOf(error, lines),
    severity: error.severity === 'warning' ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error,
    code: error.rule,
    ...(isDocumented(error.rule) ? {codeDescription: {href: `${RULE_DOCUMENTATION}${error.rule}.html`}} : {}),
    source: 'gurkencheck',
    message: error.message,
  };
}

