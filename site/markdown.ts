/**
 * Just enough Markdown to put a document from the repository on the site.
 *
 * The migration guide is written for GitHub to render, and copying it into
 * the generator by hand would leave two copies to drift apart. This reads the
 * file as it is instead. It knows the handful of things such a document uses
 * - headings, paragraphs, lists, fenced code, inline code, bold and links -
 * and nothing more, so that a page built from it is never a surprise.
 */
import {escapeHtml} from './html.ts';

/** A document split into its title and everything below it. */
export interface Rendered {
  /** The text of the `#` heading, which the page shows as its own `<h1>`. */
  title: string;
  /** The paragraphs between the title and the first section. */
  intro: string;
  /** The sections, as HTML. */
  body: string;
}

/**
 * A code span is matched the way GitHub matches one: a run of backticks
 * closes only on a run of the same length. A run with no partner, like the
 * three backticks a sentence about fenced code mentions, is plain text.
 */
const CODE_SPAN = /(?<!`)(`+)(?!`)(.+?)(?<!`)\1(?!`)/g;

/** Renders the text inside one block. */
export function inline(text: string): string {
  const spans: string[] = [];
  const held = text.replace(CODE_SPAN, (_whole, _ticks: string, code: string) => {
    // One space either side is padding, as it is on GitHub, unless it is all there is.
    spans.push(`<code>${escapeHtml(code.replace(/^ (.*\S.*) $/, '$1'))}</code>`);
    return `\u0000${spans.length - 1}\u0000`;
  });

  return escapeHtml(held)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\u0000(\d+)\u0000/g, (_whole, index: string) => spans[Number(index)] ?? '');
}

/** Renders a whole document. */
export function renderMarkdown(source: string): Rendered {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[] = [];
  let title = '';
  let introEnds = -1;
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length > 0) blocks.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const flushList = (): void => {
    if (list.length > 0) {
      blocks.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`);
    }
    list = [];
  };
  const flush = (): void => {
    flushParagraph();
    flushList();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';

    const fence = /^(`{3,}|~{3,})/.exec(line);
    if (fence !== null) {
      flush();
      const close = fence[1] ?? '```';
      const code: string[] = [];
      for (index += 1; index < lines.length && !(lines[index] ?? '').startsWith(close); index += 1) {
        code.push(lines[index] ?? '');
      }
      blocks.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = /^(#{1,3}) +(.*?) *#* *$/.exec(line);
    if (heading !== null) {
      flush();
      const level = heading[1]?.length ?? 1;
      const text = heading[2] ?? '';
      if (level === 1 && title === '') {
        title = text;
      } else {
        if (introEnds === -1) introEnds = blocks.length;
        // A document has one title, so a later `#` is a section like any other.
        const tag = `h${Math.max(level, 2)}`;
        blocks.push(`<${tag}>${inline(text)}</${tag}>`);
      }
      continue;
    }

    const item = /^[-*] +(.*)$/.exec(line);
    if (item !== null) {
      flushParagraph();
      list.push(item[1] ?? '');
      continue;
    }

    if (line.trim() === '') {
      flush();
      continue;
    }

    // An indented line under a list item carries the item on.
    if (list.length > 0 && /^ {2,}\S/.test(line)) {
      list[list.length - 1] += ` ${line.trim()}`;
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }
  flush();

  const split = introEnds === -1 ? blocks.length : introEnds;
  return {
    title,
    intro: blocks.slice(0, split).join('\n'),
    body: blocks.slice(split).join('\n'),
  };
}
