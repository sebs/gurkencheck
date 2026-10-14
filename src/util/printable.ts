/**
 * Text from a feature file, made safe to put in front of a reader.
 */

/**
 * Characters that act rather than show: controls (C0, DEL, C1), format
 * characters - the bidirectional overrides and marks, the byte order mark,
 * zero-width spaces - and the line and paragraph separators. The zero-width
 * joiner is a format character too, but it is what holds a family emoji
 * together, so it is left be.
 */
const UNPRINTABLE = /(?!\u200D)[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

const NAMED_ESCAPES: Record<string, string> = {'\n': '\\n', '\r': '\\r', '\t': '\\t'};

/**
 * `text` with each such character written out as an escape - `\n`, `‮`
 * - which shows it is there without letting it act: a message quotes the file
 * it is about, and a file can hold an escape sequence that clears the screen,
 * or a right-to-left override that turns the rest of the line around.
 */
export function printable(text: string): string {
  return text.replace(UNPRINTABLE, (character) =>
    Object.hasOwn(NAMED_ESCAPES, character)
      ? NAMED_ESCAPES[character]!
      : `\\u${character.codePointAt(0)!.toString(16).padStart(4, '0')}`,
  );
}
