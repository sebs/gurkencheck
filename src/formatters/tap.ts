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
import type {FormatterRun} from './index.ts';
import type {FileResult, RuleError} from '../types.ts';

/**
 * Quotes a scalar for YAML using single quotes, in which the only character
 * needing attention is the quote itself.
 */
function quote(value: string): string {
  return `'${value.split("'").join("''")}'`;
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
export function startRun(): FormatterRun {
  let count = 0;

  return {
    start: () => 'TAP version 13\n',
    file(result: FileResult): string {
      count++;
      const status = fails(result) ? 'not ok' : 'ok';
      return [`${status} ${count} - ${result.filePath}`, ...diagnostics(result), ''].join('\n');
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
