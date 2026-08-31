/**
 * Console output. Colour is disabled when stderr is not a terminal, or when
 * the NO_COLOR environment variable is set.
 */

const ESC = '\u001B[';
const RESET = `${ESC}0m`;

function useColor(): boolean {
  return process.stderr.isTTY === true && !process.env['NO_COLOR'];
}

function paint(codes: string, message: string): string {
  return useColor() ? `${codes}${message}${RESET}` : message;
}

/** Writes a red message to stderr. */
export function error(message: string): void {
  console.error(paint(`${ESC}31m`, message));
}

/** Writes a bold red message to stderr. */
export function boldError(message: string): void {
  console.error(paint(`${ESC}31m${ESC}1m`, message));
}

/** Writes a message to stderr without colouring it. */
export function note(message: string): void {
  console.error(message);
}

/** Text decorations used by the stylish formatter. */
export const style = {
  gray: (text: string): string => paint(`${ESC}38;5;243m`, text),
  underline: (text: string): string => (useColor() ? `${ESC}0;4m${text}${ESC}24m` : text),
  /** Red for something that fails the run, yellow for something that does not. */
  severity: (severity: string, text: string): string =>
    paint(severity === 'warning' ? `${ESC}33m` : `${ESC}31m`, text),
};
