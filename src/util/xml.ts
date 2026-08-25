/**
 * Minimal XML writing, replacing the `xml-js` package.
 */

/** Escapes the five characters that may not appear literally in XML text. */
export function escapeXml(value: string): string {
  return value
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
  return `<![CDATA[${value.split(']]>').join(']]]]><![CDATA[>')}]]>`;
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
