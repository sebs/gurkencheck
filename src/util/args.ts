/**
 * Saying what is wrong with the command line in gurkencheck's own words.
 */

/**
 * The message for an error `parseArgs` threw.
 *
 * Node's own message for an unknown option ends in a quote it never closes,
 * `as in '-- "--bogus"`, and talks about positional arguments rather than
 * the files you were trying to name.
 */
export function describeArgumentError(thrown: unknown): string {
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  const code = (thrown as {code?: unknown} | undefined)?.code;

  if (code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
    const option = /^Unknown option '([^']*)'/u.exec(message)?.[1];
    if (option !== undefined) {
      return `Unknown option "${option}". To name a file starting with -, put it after --, as in -- ${option}`;
    }
  }
  return message;
}
