/**
 * TAP version 13 output.
 *
 * One test point per file, so a clean run still reports every file it looked
 * at, which is what TAP consumers expect. Findings are carried in the YAML
 * diagnostic block. A file is `not ok` only when it holds something that
 * fails the run, so a file with warnings alone passes but still says why.
 *
 * Written as the results arrive. A harness seeing `ok 1` while file two is
 * still being checked is the whole point of TAP, and holding the stream back
 * to print it in one go gives that up for nothing. The plan comes last
 * instead of first, because the count is only known then - TAP 13 allows it
 * at either end for exactly this reason.
 */
import type {SyncFormatterRun} from './index.ts';
import {actsRatherThanShows, writtenOut} from '../util/printable.ts';
import type {FileResult, RuleError} from '../types.ts';

/**
 * Characters a single-quoted YAML scalar cannot hold as they are: anything
 * YAML does not count as printable, and line breaks, which it would fold -
 * among them NEL, U+2028 and U+2029, which YAML 1.1 parsers take for line
 * breaks too and turn into spaces.
 */
const NEEDS_ESCAPING = /[^\t\u0020-\u007E\u00A0-\u2027\u202A-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u;

/**
 * True for a character to escape: one YAML cannot quote plainly, or one that
 * acts rather than shows - a bidi override, a zero-width space. YAML holds
 * those as they are, but the stream is read in a CI log or a terminal, where
 * a right-to-left override turns the rest of the line around, as stylish and
 * the test point's description already keep it from doing.
 */
function needsEscaping(character: string): boolean {
  return NEEDS_ESCAPING.test(character) || actsRatherThanShows(character);
}

/**
 * Quotes a scalar for YAML. Single quotes, in which the only character needing
 * attention is the quote itself, unless the value holds something they cannot
 * carry; then double quotes, which can escape anything.
 */
function quote(value: string): string {
  if (![...value].some(needsEscaping)) {
    return `'${value.split("'").join("''")}'`;
  }
  let escaped = '';
  for (const character of value) {
    if (character === '"' || character === '\\') {
      escaped += `\\${character}`;
    } else if (needsEscaping(character)) {
      const code = character.codePointAt(0)!;
      // YAML's \u takes four digits exactly; beyond them, \U takes eight.
      escaped +=
        code <= 0xff
          ? `\\x${code.toString(16).padStart(2, '0')}`
          : code <= 0xffff
            ? `\\u${code.toString(16).padStart(4, '0')}`
            : `\\U${code.toString(16).padStart(8, '0')}`;
    } else {
      escaped += character;
    }
  }
  return `"${escaped}"`;
}

/**
 * Escapes a test point's description. An unescaped `#` starts a directive, so
 * a failing file whose path holds `# TODO` or `# SKIP` would be read as one
 * that is allowed to fail, and the run would pass. A line break would end the
 * test point and leave the rest of the path as a line TAP does not know, so
 * it and the other control characters are written as escapes; backslashes
 * are escaped too, so `\n` cannot be mistaken for one.
 */
function description(text: string): string {
  // Backslashes first, so that the escapes written after them read as ones;
  // then everything that would act rather than show - line breaks, C1
  // controls and NEL, bidirectional overrides, U+2028 - as stylish has it.
  return writtenOut(text.replace(/[\\#]/g, '\\$&'));
}

function severityOf(error: RuleError): string {
  return error.severity ?? 'error';
}

function fails(result: FileResult): boolean {
  return result.errors.some((error) => severityOf(error) === 'error');
}

function diagnostics(result: FileResult): string[] {
  if (result.errors.length === 0) {
    return [];
  }

  const lines = ['  ---', '  findings:'];
  for (const error of result.errors) {
    lines.push(`    - severity: ${severityOf(error)}`);
    lines.push(`      message: ${quote(error.message)}`);
    lines.push(`      rule: ${quote(error.rule)}`);
    lines.push(`      line: ${error.line}`);
    if (error.column !== undefined) {
      lines.push(`      column: ${error.column}`);
    }
  }
  lines.push('  ...');
  return lines;
}

/**
 * A TAP stream, written a test point at a time.
 *
 * A new one per run, so its counter belongs to that run and two at once
 * cannot number each other's test points.
 */
export function startRun(): SyncFormatterRun {
  let count = 0;

  return {
    start: () => 'TAP version 13\n',
    file(result: FileResult): string {
      count++;
      const status = fails(result) ? 'not ok' : 'ok';
      return [`${status} ${count} - ${description(result.filePath)}`, ...diagnostics(result), ''].join('\n');
    },
    end: () => `1..${count}\n`,
  };
}

/** Renders the results as a TAP 13 stream. */
export function format(results: readonly FileResult[]): string {
  const run = startRun();
  const text = [run.start?.() ?? '', ...results.map((result) => run.file(result)), run.end?.() ?? ''];
  // The caller prints this with console.log, which adds the last line break.
  return text.join('').replace(/\n$/u, '');
}

/** Writes the TAP stream to stdout. */
export function printResults(results: readonly FileResult[]): void {
  console.log(format(results));
}
