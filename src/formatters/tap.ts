/**
 * TAP version 13 output.
 *
 * One test point per file, so a clean run still reports every file it looked
 * at, which is what TAP consumers expect. Findings are carried in the YAML
 * diagnostic block. A file is `not ok` only when it holds something that
 * fails the run, so a file with warnings alone passes but still says why.
 */
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

/** Renders the results as a TAP 13 stream. */
export function format(results: readonly FileResult[]): string {
  const lines = ['TAP version 13', `1..${results.length}`];

  results.forEach((result, index) => {
    const status = fails(result) ? 'not ok' : 'ok';
    lines.push(`${status} ${index + 1} - ${result.filePath}`);
    lines.push(...diagnostics(result));
  });

  return lines.join('\n');
}

/** Writes the TAP stream to stdout. */
export function printResults(results: readonly FileResult[]): void {
  console.log(format(results));
}
