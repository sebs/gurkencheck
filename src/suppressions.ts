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
 * end of the file unless an `enable` closes it.
 *
 * Comments are read from the raw text rather than the parsed document, so a
 * directive still works in a file the parser rejected. A `#` inside a doc
 * string is content, not a comment, and is ignored.
 *
 * The rules the parser enforces cannot be switched off this way. A file that
 * breaks one of them cannot be read at all, so hiding the message would leave
 * nothing but silence.
 */
import type {RuleError} from './types.ts';
import {markDocStrings} from './util/lines.ts';

const DIRECTIVE = /^\s*#\s*gurkencheck-(disable-next-line|disable-file|disable|enable)\b(.*)$/;

/** Stands in for "every rule" when a directive names none. */
const ALL_RULES = '*';

/** A rule switched off across a run of lines. */
interface Range {
  rule: string;
  from: number;
  /** Inclusive; Infinity when nothing switched it back on. */
  to: number;
}

export interface Suppressions {
  /** True when a directive in the file covers this error. */
  isSuppressed(error: RuleError): boolean;
  /** True when the file carries no directives at all. */
  readonly isEmpty: boolean;
}

function parseRuleNames(rest: string): string[] {
  const names = rest
    .split(/[,\s]+/)
    .map((name) => name.trim())
    .filter((name) => name !== '');
  return names.length > 0 ? names : [ALL_RULES];
}

/** Reads the directives out of a feature file's lines. */
export function readSuppressions(lines: readonly string[]): Suppressions {
  const inDocString = markDocStrings(lines);

  const wholeFile = new Set<string>();
  /** Line number -> the rules switched off on that line only. */
  const nextLine = new Map<number, Set<string>>();
  const ranges: Range[] = [];
  /** Rule -> the line its still-open `disable` started on. */
  const open = new Map<string, number>();
  let found = false;

  lines.forEach((text, index) => {
    if (inDocString[index] === true) {
      return;
    }
    const directive = DIRECTIVE.exec(text);
    if (directive === null) {
      return;
    }

    found = true;
    const kind = directive[1]!;
    const names = parseRuleNames(directive[2] ?? '');
    const line = index + 1;

    for (const name of names) {
      if (kind === 'disable-file') {
        wholeFile.add(name);
      } else if (kind === 'disable-next-line') {
        const onLine = nextLine.get(line + 1) ?? new Set<string>();
        onLine.add(name);
        nextLine.set(line + 1, onLine);
      } else if (kind === 'disable') {
        if (!open.has(name)) {
          open.set(name, line);
        }
      } else {
        // enable
        const from = open.get(name);
        if (from !== undefined) {
          ranges.push({rule: name, from, to: line});
          open.delete(name);
        }
        if (name === ALL_RULES) {
          // `enable` with no names closes everything that is open.
          for (const [openRule, openFrom] of open) {
            ranges.push({rule: openRule, from: openFrom, to: line});
          }
          open.clear();
        }
      }
    }
  });

  for (const [rule, from] of open) {
    ranges.push({rule, from, to: Infinity});
  }

  const covers = (rule: string, candidate: string): boolean =>
    candidate === ALL_RULES || candidate === rule;

  return {
    isEmpty: !found,
    isSuppressed(error: RuleError): boolean {
      for (const candidate of wholeFile) {
        if (covers(error.rule, candidate)) return true;
      }
      for (const candidate of nextLine.get(error.line) ?? []) {
        if (covers(error.rule, candidate)) return true;
      }
      return ranges.some(
        (range) =>
          covers(error.rule, range.rule) && error.line >= range.from && error.line <= range.to,
      );
    },
  };
}
