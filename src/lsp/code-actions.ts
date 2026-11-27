/**
 * Quick fixes for findings: switching the rule off where the finding is, and
 * fixing the two findings whose fix is never in doubt.
 *
 * Switching a rule off writes the same directive a person would - a comment
 * above the line, or at the top of the file - so what the editor did can be
 * read, kept or taken back like anything else in the file.
 */
import {PARSER_RULES, parseFeature, toLines} from '../gherkin/parse.ts';
import {languageHeader} from '../gherkin/dialects.ts';
import {DIRECTIVE_CHECKS} from '../suppressions.ts';
import type {RuleError} from '../types.ts';
import {markDocStrings} from '../util/lines.ts';
import type {CodeAction, Diagnostic, TextEdit} from './protocol.ts';

/** A finding, with the diagnostic the editor was shown for it. */
export interface Shown {
  error: RuleError;
  diagnostic: Diagnostic;
}

/**
 * The rules no directive switches off: what the parser refuses, a rule that
 * crashed, and the checks on directives themselves. Offering to switch one
 * off would write a directive that does nothing.
 */
const UNSWITCHABLE: ReadonlySet<string> = new Set([...PARSER_RULES, ...DIRECTIVE_CHECKS]);

function insert(line: number, newText: string): TextEdit {
  return {range: {start: {line, character: 0}, end: {line, character: 0}}, newText};
}

/** The edit that gives the file the ending it is missing, or takes it away. */
function fixEndOfFile(lines: readonly string[], lineBreak: string): TextEdit | undefined {
  const last = lines.length - 1;
  if (lines[last] !== '') {
    const end = {line: last, character: lines[last]!.length};
    return {range: {start: end, end}, newText: lineBreak};
  }
  let content = last;
  while (content > 0 && lines[content] === '') {
    content--;
  }
  if (content === last) {
    return undefined;
  }
  return {
    range: {start: {line: content, character: lines[content]!.length}, end: {line: last, character: 0}},
    newText: '',
  };
}

/** The fix for a finding whose fix is never in doubt, if it has one. */
function fixFor(error: RuleError, lines: readonly string[], lineBreak: string): {title: string; edit: TextEdit} | undefined {
  if (error.rule === 'no-trailing-spaces' && error.line > 0) {
    const line = error.line - 1;
    const text = lines[line] ?? '';
    const content = text.trimEnd().length;
    if (content === text.length) return undefined;
    return {
      title: 'Remove the trailing spaces',
      edit: {range: {start: {line, character: content}, end: {line, character: text.length}}, newText: ''},
    };
  }
  if (error.rule === 'new-line-at-eof') {
    const edit = fixEndOfFile(lines, lineBreak);
    if (edit === undefined) return undefined;
    return {title: edit.newText === '' ? 'Remove the new line at the end of the file' : 'Add a new line at the end of the file', edit};
  }
  return undefined;
}

/**
 * The quick fixes for the findings the editor asked about, in the file as it
 * now stands.
 */
export function codeActionsFor(
  uri: string,
  text: string,
  shown: readonly Shown[],
  language?: string,
): CodeAction[] {
  const lines = toLines(text);
  const lineBreak = text.includes('\r\n') ? '\r\n' : '\n';
  // A comment inside a doc string is part of the doc string, so a directive
  // put there would switch nothing off and change the step's argument.
  let inDocString: boolean[];
  try {
    inDocString = markDocStrings(lines, parseFeature(uri, text, language).feature);
  } catch {
    inDocString = markDocStrings(lines);
  }
  const header = languageHeader(lines);

  const actions: CodeAction[] = [];
  const titles = new Set<string>();
  const add = (title: string, edit: TextEdit, diagnostic: Diagnostic, isPreferred = false): void => {
    if (titles.has(title)) return;
    titles.add(title);
    actions.push({
      title,
      kind: 'quickfix',
      diagnostics: [diagnostic],
      ...(isPreferred ? {isPreferred} : {}),
      edit: {changes: {[uri]: [edit]}},
    });
  };

  for (const {error, diagnostic} of shown) {
    const fix = fixFor(error, lines, lineBreak);
    if (fix !== undefined) {
      add(fix.title, fix.edit, diagnostic, true);
    }
  }

  for (const {error, diagnostic} of shown) {
    if (UNSWITCHABLE.has(error.rule)) {
      continue;
    }
    const line = error.line - 1;
    if (error.line > 0 && line < lines.length && inDocString[line] !== true) {
      const indentation = /^\s*/u.exec(lines[line]!)![0];
      add(
        `Disable ${error.rule} for this line`,
        insert(line, `${indentation}# gurkencheck-disable-next-line ${error.rule}${lineBreak}`),
        diagnostic,
      );
    }
    // Below a `# language:` header rather than above it, where the header
    // is easier to miss.
    add(
      `Disable ${error.rule} for this file`,
      insert(header?.line ?? 0, `# gurkencheck-disable-file ${error.rule}${lineBreak}`),
      diagnostic,
    );
  }
  return actions;
}
