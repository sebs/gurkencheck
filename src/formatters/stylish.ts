import {style} from '../logger.ts';
import type {FormatterRun} from './index.ts';
import type {FileResult, RuleError} from '../types.ts';

/** `12:5` when the rule knows a column, `12` when it does not. */
function position(error: RuleError): string {
  return error.column === undefined ? String(error.line) : `${error.line}:${error.column}`;
}

function severityOf(error: RuleError): string {
  return error.severity ?? 'error';
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
  // "warning" is the longer of the two, so both line up at its width.
  const severity = severityOf(error).padEnd('warning'.length);
  return (
    indent +
    (colorize ? style.gray(line) : line) +
    gap +
    (colorize ? style.severity(severityOf(error), severity) : severity) +
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

/**
 * One file's block, or nothing when the file is clean.
 *
 * The columns are lined up within a file rather than across the whole run, so
 * a block only ever needed that one file's findings - which means it can be
 * written the moment the file is done, with the output byte for byte what it
 * always was.
 */
function block(result: FileResult, consoleWidth: number): string {
  if (result.errors.length === 0) {
    return '';
  }

  const lineWidth = widestLineNumber(result);
  const messageWidth = messageColumnWidth(result, lineWidth, consoleWidth);

  const lines = [
    style.underline(result.filePath),
    ...result.errors.map((error) => formatError(error, lineWidth, messageWidth, true)),
  ];
  // A blank line between blocks, as printing '\n' with console.log gave.
  return `${lines.join('\n')}\n\n\n`;
}

function widthOfConsole(): number {
  return process.stdout.isTTY ? process.stdout.columns : Infinity;
}

/** Blocks written as each file is done rather than at the end of the run. */
export function startRun(): FormatterRun {
  const consoleWidth = widthOfConsole();
  return {
    file: (result: FileResult): string => block(result, consoleWidth),
  };
}

/**
 * Human readable output, one block per file with findings.
 *
 * Results go to stdout so they can be redirected or piped. Anything that
 * stops the linter running is written to stderr instead.
 */
export function printResults(results: readonly FileResult[]): void {
  const consoleWidth = widthOfConsole();

  for (const result of results) {
    if (result.errors.length === 0) {
      continue;
    }

    const lineWidth = widestLineNumber(result);
    const messageWidth = messageColumnWidth(result, lineWidth, consoleWidth);

    console.log(style.underline(result.filePath));
    for (const error of result.errors) {
      console.log(formatError(error, lineWidth, messageWidth, true));
    }
    console.log('\n');
  }
}
