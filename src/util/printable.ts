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

/** True for a single character that acts rather than shows. */
export function actsRatherThanShows(character: string): boolean {
  return /(?!\u200D)[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(character);
}

const NAMED_ESCAPES: Record<string, string> = {'\n': '\\n', '\r': '\\r', '\t': '\\t'};

/**
 * `text` with each such character written out as an escape - `\n`, `\u202e`
 * - which shows it is there without letting it act: a message quotes the file
 * it is about, and a file can hold an escape sequence that clears the screen,
 * or a right-to-left override that turns the rest of the line around.
 *
 * A backslash in the text that would read as the start of an escape is
 * doubled, so text that only looks like one - the six characters `\u202e` -
 * cannot pass for a hidden character, nor a real one hide as text.
 */
export function printable(text: string): string {
  return writtenOut(text.replace(/\\(?=[\\nrtu])/gu, '\\\\'));
}

/**
 * The characters that act written out, and nothing else: for a format that
 * escapes its backslashes its own way, as TAP does.
 */
export function writtenOut(text: string): string {
  return text.replace(UNPRINTABLE, (character) => {
    if (Object.hasOwn(NAMED_ESCAPES, character)) {
      return NAMED_ESCAPES[character]!;
    }
    // Beyond four digits in braces: \ue0041 reads as U+E004 and a 1.
    const code = character.codePointAt(0)!.toString(16);
    return code.length > 4 ? `\\u{${code}}` : `\\u${code.padStart(4, '0')}`;
  });
}
