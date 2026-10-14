/**
 * How wide text is in a terminal, for lining up columns.
 *
 * `.length` counts UTF-16 units and `[...text]` code points, but a terminal
 * gives most Chinese, Japanese and Korean characters and most emoji two
 * columns, and a combining accent none - so a column of steps written in
 * Japanese came out ragged, one column short per character.
 */

/** Characters a terminal draws two columns wide. */
const WIDE =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u;

/** Characters that take no column of their own. */
const ZERO_WIDTH = /[\p{Mn}\p{Me}​-‏︀-️]/u;

/** An emoji drawn as one: ✅, ⭐, or anything asking for emoji presentation. */
const EMOJI = /\p{Emoji_Presentation}|\uFE0F/u;

const GRAPHEMES = new Intl.Segmenter(undefined, {granularity: 'grapheme'});

/**
 * The columns one grapheme cluster takes - what a reader sees as one
 * character, however many code points make it: a family joined from four
 * emoji, or a thumbs-up with a skin tone, is drawn once, two columns wide.
 */
function widthOf(cluster: string): number {
  if (EMOJI.test(cluster)) return 2;
  const first = String.fromCodePoint(cluster.codePointAt(0)!);
  if (ZERO_WIDTH.test(first) && [...cluster].every((character) => ZERO_WIDTH.test(character))) return 0;
  return WIDE.test(first) ? 2 : 1;
}

function* clusters(text: string): Generator<string> {
  for (const {segment} of GRAPHEMES.segment(text)) {
    yield segment;
  }
}

/** The number of terminal columns `text` takes. */
export function displayWidth(text: string): number {
  let width = 0;
  for (const cluster of clusters(text)) {
    width += widthOf(cluster);
  }
  return width;
}

/** `text` padded with spaces to `width` columns. */
export function padEndToWidth(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - displayWidth(text)));
}

/** `text` padded with spaces in front to `width` columns. */
export function padStartToWidth(text: string, width: number): string {
  return ' '.repeat(Math.max(0, width - displayWidth(text))) + text;
}

/** `text` cut to `width` columns, ending in `…` when anything was cut. */
export function truncateToWidth(text: string, width: number): string {
  if (displayWidth(text) <= width) return text;
  let kept = '';
  let used = 0;
  for (const cluster of clusters(text)) {
    const next = widthOf(cluster);
    if (used + next > width - 1) break;
    kept += cluster;
    used += next;
  }
  return `${kept}…`;
}
