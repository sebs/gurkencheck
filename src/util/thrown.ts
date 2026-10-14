/**
 * What went wrong, from whatever was thrown.
 */

/**
 * The message of an error, or anything else thrown as text - even something
 * that cannot be turned into a string, such as an object with no prototype.
 * Turning one into a string threw from inside the handler meant to report
 * it, and the run was lost with a message about the handler.
 */
export function reasonOf(thrown: unknown): string {
  if (thrown instanceof Error) {
    return thrown.message;
  }
  return asText(thrown);
}

/** A value as text, even one that cannot be turned into a string. */
export function asText(value: unknown): string {
  try {
    return String(value);
  } catch {
    return 'a value that cannot be shown as text';
  }
}
