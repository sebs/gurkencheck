/**
 * Minimal XML writing, replacing the `xml-js` package.
 */

/**
 * Characters XML 1.0 cannot carry at all, not even as a character reference:
 * most control characters, the two non-characters U+FFFE and U+FFFF, and half
 * of a surrogate pair on its own - which is all a `u` pattern matches in
 * that range, a whole pair being one code point.
 */
const NOT_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/gu;

/**
 * Replaces what XML cannot carry with U+FFFD, the replacement character. One
 * stray control character in a step would otherwise make the whole report
 * unreadable to every parser.
 */
function toXmlCharacters(value: string): string {
  return value.replace(NOT_XML, '\uFFFD');
}

/** Escapes the five characters that may not appear literally in XML text. */
export function escapeXml(value: string): string {
  return toXmlCharacters(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Wraps text in a CDATA section, splitting it if it contains the `]]>`
 * terminator, which cannot be escaped inside CDATA.
 */
export function cdata(value: string): string {
  return `<![CDATA[${toXmlCharacters(value).split(']]>').join(']]]]><![CDATA[>')}]]>`;
}

/** Renders `name="value"` pairs, skipping attributes with no value. */
export function attributes(pairs: Record<string, string | number | undefined>): string {
  return Object.entries(pairs)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ` ${name}="${escapeXml(String(value))}"`)
    .join('');
}

export const XML_DECLARATION = '<?xml version="1.0" encoding="utf-8"?>';

/** Indents each line of `content` by `depth` levels of four spaces. */
export function indent(content: string, depth: number): string {
  const padding = '    '.repeat(depth);
  return content
    .split('\n')
    .map((line) => (line === '' ? line : padding + line))
    .join('\n');
}
