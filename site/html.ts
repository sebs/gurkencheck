/**
 * The little bit of HTML templating the documentation site needs.
 */

/** Escapes text so it can be dropped into HTML content or an attribute. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Turns a rule name into the file name of its page. */
export function pageFor(ruleName: string): string {
  return `rules/${ruleName}.html`;
}

/** Turns a setting name into the anchor that links straight to it. */
export function anchorFor(settingName: string): string {
  return `setting-${settingName.replace(/[^\w-]+/g, '-')}`;
}

export interface PageOptions {
  title: string;
  description: string;
  /** How many directories deep the page sits, for relative links. */
  depth: number;
  body: string;
}

/** Wraps page content in the shared document shell. */
export function page({title, description, depth, body}: PageOptions): string {
  const root = depth === 0 ? '.' : '..';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="stylesheet" href="${root}/style.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><text y='14' font-size='14'>&#x1F952;</text></svg>">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${body}
<footer>
<p>gurkencheck is free software under the ISC licence.
<a href="https://github.com/gurkencheck/gurkencheck">Source on GitHub</a></p>
</footer>
</body>
</html>
`;
}
