/**
 * Deciding when two steps are the same step.
 *
 * `I have 3 items in my cart` and `I have 7 items in my cart` are one step
 * behind one step definition, and counting them as two would make every
 * measure of reuse meaningless. So the parts a step definition captures as
 * arguments - numbers, quoted strings, Scenario Outline placeholders - are
 * replaced by a marker before two steps are compared.
 *
 * The keyword is not part of the text: the Gherkin parser hands it over
 * separately, and `Given I am logged in` and `And I am logged in` are the
 * same step written in two places.
 *
 * Each kind of argument keeps a marker of its own, so a placeholder and a
 * value written in its place stay apart: `I have <count> items` does not
 * become `I have 0 items`. That understates reuse a little in an outline
 * heavy suite, and it is the trade worth making, because the normalised text
 * is what the report shows a reader - and a `0` in a step that has no number
 * in it would be a lie about the file. The two are put back together by the
 * near-duplicate report in `similar.ts`, which is a couple of edits apart.
 */

/** Stands in for a Scenario Outline placeholder, whatever it was called. */
export const PLACEHOLDER_MARKER = '<>';

/** Stands in for a double quoted string, whatever it contained. */
export const STRING_MARKER = '""';

/** Stands in for a number, whatever its value. */
export const NUMBER_MARKER = '0';

const PLACEHOLDER = /<[^<>]*>/gu;
/** A double quoted string, which may hold quotes escaped with a backslash. */
const QUOTED = /"(?:[^"\\]|\\.)*"/gu;

/**
 * A whole number or decimal standing on its own, with its minus sign. The
 * word boundaries keep `1st` and `v2` intact, where the digits are part of a
 * name rather than a value a step definition would capture.
 */
const NUMBER = /(?:(?<![\p{L}\p{N}_])-)?\b\d+(?:[.,]\d+)*\b/gu;

const WHITESPACE = /\s+/gu;

/**
 * The text without a full stop or exclamation mark at the end, which changes
 * nothing, and whatever spaces and further stops sit in front of it: `I own
 * it .` and `I own it` are one step. A text of nothing but punctuation is
 * left as it is rather than made empty.
 *
 * A loop rather than a regular expression: `/[\s.!]*[.!]$/` is tried from
 * every position in a long run of ` .`, which takes seconds on one step.
 */
function withoutTrailingPunctuation(text: string): string {
  if (!text.endsWith('.') && !text.endsWith('!')) {
    return text;
  }
  let end = text.length;
  while (end > 0 && /[\s.!]/u.test(text[end - 1]!)) {
    end--;
  }
  return end === 0 ? text : text.slice(0, end);
}

/**
 * The form of a step text used to decide whether two steps are the same one.
 *
 * Single quotes are deliberately left alone: `the user's cart is 'empty'` has
 * three of them, and a rule masking whatever sits between a pair would eat
 * half the sentence. Cucumber's own expressions quote with `"` anyway.
 */
export function normaliseStepText(text: string): string {
  const normalised = text
    .replace(PLACEHOLDER, PLACEHOLDER_MARKER)
    .replace(QUOTED, STRING_MARKER)
    .replace(NUMBER, NUMBER_MARKER)
    .toLowerCase()
    .replace(WHITESPACE, ' ')
    .trim();
  return withoutTrailingPunctuation(normalised);
}

/** How many words a step is made of, counted before normalisation. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(WHITESPACE).length;
}
