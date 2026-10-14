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
export function describeArgumentError(thrown: unknown, usage = ''): string {
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  const code = (thrown as {code?: unknown} | undefined)?.code;

  // Node names what is missing `<value>`; the help calls it a <path>, a
  // <format> or <globs>, and the two should agree.
  const missing = /^Option '(-\w, )?(--[\w-]+) <value>' argument missing/u.exec(message);
  if (missing !== null) {
    const [, short = '', long] = missing;
    const placeholder = new RegExp(`${long} (<[^>]+>)`, 'u').exec(usage)?.[1] ?? '<value>';
    return `${short}${long} needs a value: ${short}${long} ${placeholder}`;
  }

  // A value starting with a dash, as in -c -x.json: Node's three lines come
  // down to one, with the way to pass it.
  const ambiguous = /^Option '(-{1,2}[\w-]+)' argument is ambiguous/u.exec(message);
  if (ambiguous !== null) {
    const option = ambiguous[1]!;
    const long = option.startsWith('--') ? option : new RegExp(`${option}, (--[\\w-]+)`, 'u').exec(usage)?.[1] ?? option;
    return `${option} was given a value starting with -. Write it as ${long}=<value> to pass one, or give ${option} a value.`;
  }

  // A switch given a value, as in --help=yes.
  const noValue = /^Option '(?:-\w, )?(--[\w-]+)' does not take an argument/u.exec(message);
  if (noValue !== null) {
    return `${noValue[1]} takes no value.`;
  }

  if (code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
    const option = /^Unknown option '([^']*)'/u.exec(message)?.[1];
    if (option !== undefined) {
      return `Unknown option "${option}". To name a file starting with -, put it after --, as in -- ${option}`;
    }
  }
  return message;
}
