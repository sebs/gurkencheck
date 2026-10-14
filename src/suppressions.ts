/**
 * Switching rules off from inside a feature file.
 *
 * Ignoring a whole file is often too blunt: one long step name should not
 * cost you every other check in the file. These directives are written as
 * Gherkin comments, following the shape eslint and golangci-lint use:
 *
 *   # gurkencheck-disable-next-line name-length
 *   # gurkencheck-disable use-and, name-length
 *   # gurkencheck-enable use-and
 *   # gurkencheck-disable-file no-trailing-spaces
 *
 * With no rule names, a directive covers every rule. `disable` runs to the
 * end of the file unless an `enable` closes it. As in eslint, ` -- ` ends the
 * rule names, and what follows is a note on why:
 *
 *   # gurkencheck-disable-file name-length -- generated from the API spec
 *
 * Comments are read from the raw text rather than the parsed document, so a
 * directive still works in a file the parser rejected. A `#` inside a doc
 * string is content, not a comment, and is ignored.
 *
 * The rules the parser enforces cannot be switched off this way. A file that
 * breaks one of them cannot be read at all, so hiding the message would leave
 * nothing but silence.
 */
import type {Feature} from '@cucumber/messages';
import type {RuleError} from './types.ts';
import {markDocStrings} from './util/lines.ts';

/**
 * A directive, then the rules it names. Whitespace or the end of the line has
 * to follow the directive's name: `\b` would also match before a hyphen, and
 * read `disable-nextline` as a `disable` of every rule named after it.
 */
const DIRECTIVE = /^\s*#\s*gurkencheck-(disable-next-line|disable-file|disable|enable)(?=\s|$)(.*)$/;

/** The warning given for a directive naming a rule that does not exist. */
export const UNKNOWN_RULE_IN_DIRECTIVE = 'unknown-rule-in-directive';

/** The warning given for a comment that looks like a directive and is not one. */
export const UNKNOWN_DIRECTIVE = 'unknown-directive';

/** The directives there are, for telling a misspelt one what it meant. */
export const DIRECTIVES = [
  'gurkencheck-disable-next-line',
  'gurkencheck-disable-file',
  'gurkencheck-disable',
  'gurkencheck-enable',
] as const;

/** A comment that starts like a directive, in any case. */
const LOOKS_LIKE_DIRECTIVE = /^\s*#\s*(gurkencheck-[\w-]*)/iu;

/** Stands in for "every rule" when a directive names none. */
const ALL_RULES = '*';

/** A `disable` or `enable`, in the order they appear. */
interface Switch {
  line: number;
  off: boolean;
  rule: string;
}

export interface Suppressions {
  /** True when a directive in the file covers this error. */
  isSuppressed(error: RuleError): boolean;
  /** True when the file carries no directives at all. */
  readonly isEmpty: boolean;
  /** Every rule a directive names, with the line of the directive. */
  readonly named: readonly {rule: string; line: number}[];
  /** Comments that look like a directive and are not one, with their line. */
  readonly misspelt: readonly {directive: string; line: number}[];
}

function parseRuleNames(rest: string): string[] {
  // `-- reason` explains the directive - with two dashes or more, as eslint
  // takes it; its words are not rule names, and
  // read as ones they would leave the directive covering nothing.
  const names = rest
    .replace(/(?:^|\s)-{2,}(?:\s.*)?$/u, '')
    .split(/[,\s]+/)
    .map((name) => name.trim())
    .filter((name) => name !== '');
  return names.length > 0 ? names : [ALL_RULES];
}

/**
 * Reads the directives out of a feature file's lines. Given the parsed
 * document, it is used to tell where the doc strings are.
 */
export function readSuppressions(lines: readonly string[], feature?: Feature): Suppressions {
  const inDocString = markDocStrings(lines, feature);

  const wholeFile = new Set<string>();
  /** Line number -> the rules switched off on that line only. */
  const nextLine = new Map<number, Set<string>>();
  const switches: Switch[] = [];
  const named: {rule: string; line: number}[] = [];
  const misspelt: {directive: string; line: number}[] = [];
  let found = false;
  /**
   * The `Feature:` line, or without a parsed feature the first line that is
   * neither blank nor a comment. A finding about the whole file belongs to no
   * line, so it is taken to sit here: a `disable` above the Feature covers
   * it - in the comments at the top, or between its tags and the keyword -
   * and one further down does not.
   */
  const firstContent = lines.findIndex((text) => text.trim() !== '' && !text.trim().startsWith('#'));
  const wholeFileLine =
    feature?.location.line ?? (firstContent === -1 ? lines.length + 1 : firstContent + 1);

  lines.forEach((text, index) => {
    if (inDocString[index] === true) {
      return;
    }
    const directive = DIRECTIVE.exec(text);
    if (directive === null) {
      // Ignored, as it always was - a misspelt directive must not switch off
      // something else - but no longer without a word.
      const lookalike = LOOKS_LIKE_DIRECTIVE.exec(text);
      if (lookalike !== null) {
        misspelt.push({directive: lookalike[1]!, line: index + 1});
      }
      return;
    }

    found = true;
    const kind = directive[1]!;
    const names = parseRuleNames(directive[2] ?? '');
    const line = index + 1;

    for (const name of names) {
      if (name !== ALL_RULES) {
        named.push({rule: name, line});
      }
      if (kind === 'disable-file') {
        wholeFile.add(name);
      } else if (kind === 'disable-next-line') {
        const onLine = nextLine.get(line + 1) ?? new Set<string>();
        onLine.add(name);
        nextLine.set(line + 1, onLine);
      } else {
        switches.push({line, off: kind === 'disable', rule: name});
      }
    }
  });

  const covers = (rule: string, candidate: string): boolean =>
    candidate === ALL_RULES || candidate === rule;

  return {
    isEmpty: !found && misspelt.length === 0,
    named,
    misspelt,
    isSuppressed(error: RuleError): boolean {
      // A rule that crashed has not checked the file, and hiding that would
      // read as a file that passed. It is never the file's to switch off.
      if (error.rule === 'unexpected-error') {
        return false;
      }
      for (const candidate of wholeFile) {
        if (covers(error.rule, candidate)) return true;
      }
      for (const candidate of nextLine.get(error.line) ?? []) {
        if (covers(error.rule, candidate)) return true;
      }
      // Whatever switched this rule on or off last, above the line, decides.
      // So `enable use-and` after a bare `disable` switches use-and back on
      // and leaves every other rule off, and `enable` with no names switches
      // everything back on.
      const line = error.line === 0 ? wholeFileLine : error.line;
      let off = false;
      for (const change of switches) {
        if (change.line > line) break;
        if (covers(error.rule, change.rule)) {
          off = change.off;
        }
      }
      return off;
    },
  };
}
