import {style} from '../logger.ts';
import type {FileResult, RuleError} from '../types.ts';

/** `12:5` when the rule knows a column, `12` when it does not. */
function position(error: RuleError): string {
  return error.column === undefined ? String(error.line) : `${error.line}:${error.column}`;
}

/**
 * Formats one error as `  <position>    <message>    <rule>`, with the columns
 * padded so they line up underneath each other.
 */
function formatError(
  error: RuleError,
  lineWidth: number,
  messageWidth: number,
  colorize: boolean,
): string {
  const indent = '  ';
  const gap = '    ';
  const line = position(error).padEnd(lineWidth);
  return (
    indent +
    (colorize ? style.gray(line) : line) +
    gap +
    error.message.padEnd(messageWidth) +
    gap +
    (colorize ? style.gray(error.rule) : error.rule)
  );
}

function widestLineNumber(result: FileResult): number {
  return result.errors.reduce((widest, error) => Math.max(widest, position(error).length), 0);
}

/**
 * The width to pad messages to. Messages that would push the line past the
 * width of the terminal are left out of the calculation, so that one long
 * message does not stretch every other line.
 */
function messageColumnWidth(result: FileResult, lineWidth: number, consoleWidth: number): number {
  return result.errors.reduce((widest, error) => {
    const unpaddedWidth = formatError(error, lineWidth, 0, false).length;
    if (unpaddedWidth >= consoleWidth) {
      return widest;
    }
    return Math.max(widest, error.message.length);
  }, 0);
}

/** Human readable output, one block per file with errors. */
export function printResults(results: readonly FileResult[]): void {
  const consoleWidth = process.stdout.isTTY ? process.stdout.columns : Infinity;

  for (const result of results) {
    if (result.errors.length === 0) {
      continue;
    }

    const lineWidth = widestLineNumber(result);
    const messageWidth = messageColumnWidth(result, lineWidth, consoleWidth);

    console.error(style.underline(result.filePath));
    for (const error of result.errors) {
      console.error(formatError(error, lineWidth, messageWidth, true));
    }
    console.error('\n');
  }
}
