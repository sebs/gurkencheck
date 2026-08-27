/**
 * The little bit of HTML templating the documentation site needs.
 */
import {version} from '../src/version.ts';
import type {Target} from './site.ts';
import {
  AUTHOR,
  canonical,
  inVersion,
  SITE_NAME,
  SOCIAL_CARD,
  TAGLINE,
  absolute,
  LICENCE,
  NPM_URL,
  REPO_URL,
} from './site.ts';

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

/** The words in a fragment of HTML, with the tags and entities taken out. */
function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&mdash;/g, '-')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#x?[0-9a-f]+;/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Turns a heading into the id a reader can link to. */
export function slugFor(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'section' : slug;
}

/** One heading found in a page. */
export interface Heading {
  id: string;
  text: string;
  level: number;
}

/** A page's content, and the headings it turned out to contain. */
export interface Anchored {
  html: string;
  headings: Heading[];
}

const HEADING = /<h([23])>([\s\S]*?)<\/h\1>/g;

/**
 * Gives every heading an id and a link to itself.
 *
 * Without one there is no way to send somebody straight to a section, and a
 * search engine has no section to offer underneath the result.
 */
export function anchorHeadings(html: string): Anchored {
  const headings: Heading[] = [];
  const used = new Set<string>();

  const anchored = html.replace(HEADING, (_whole, level: string, inner: string) => {
    const text = plainText(inner);
    const base = slugFor(text);
    let id = base;
    // Two sections may be called the same thing; two ids may not.
    for (let suffix = 2; used.has(id); suffix += 1) id = `${base}-${suffix}`;
    used.add(id);
    headings.push({id, text, level: Number(level)});

    const link = `<a class="anchor" href="#${id}" aria-label="Link to ${escapeHtml(text)}">#</a>`;
    return `<h${level} id="${id}">${inner}${link}</h${level}>`;
  });

  return {html: anchored, headings};
}

/** A list of the sections on a long page, for a reader and for a search result. */
export function tableOfContents(headings: Heading[]): string {
  const sections = headings.filter((heading) => heading.level === 2);
  if (sections.length < 4) return '';

  const items = sections
    .map((heading) => `<li><a href="#${heading.id}">${escapeHtml(heading.text)}</a></li>`)
    .join('');

  return `<nav class="toc" aria-labelledby="on-this-page">
<h2 id="on-this-page">On this page</h2>
<ul>${items}</ul>
</nav>`;
}

/**
 * Structured data for the head.
 *
 * `<` is escaped so that a description containing `</script>` cannot close the
 * element it sits in.
 */
function structuredData(blocks: object[]): string {
  if (blocks.length === 0) return '';
  const json = JSON.stringify(blocks.length === 1 ? blocks[0] : blocks).replace(/</g, '\\u003c');
  return `\n<script type="application/ld+json">${json}</script>`;
}

/**
 * The picker that moves between versions of the docs.
 *
 * Built as plain markup rather than fetched from `versions.json`, because
 * every version is rebuilt on every deploy: the list in an old version's
 * pages is as current as the one in the newest. It keeps the reader on the
 * same page across the move, and the site's 404 catches the pages that a
 * given version never had.
 */
export function versionPicker(path: string, target: Target): string {
  if (target.published.length === 0) {
    return '';
  }

  const entry = (version: string | undefined, label: string, current: boolean): string => {
    const mark = current ? ' aria-current="true"' : '';
    return `<li><a href="${escapeHtml(inVersion(version, path))}"${mark}>${escapeHtml(label)}</a></li>`;
  };

  const newest = target.published[0] ?? target.version;
  const archived = target.published
    .map((version) => entry(version, version, !target.latest && version === target.version))
    .join('');

  return `<details class="versions">
<summary>${escapeHtml(target.latest ? `${target.version} (latest)` : target.version)}</summary>
<ul>${entry(undefined, `${newest} (latest)`, target.latest)}${archived}</ul>
</details>`;
}

/** Says out loud what the canonical link says to a crawler. */
function archivedNotice(path: string, target: Target): string {
  if (target.latest) {
    return '';
  }

  const newest = target.published[0];
  const named = newest === undefined ? 'the latest version' : `version ${newest}`;

  return `<p class="archived">You are reading the documentation for
${escapeHtml(SITE_NAME)} ${escapeHtml(target.version)}.
<a href="${escapeHtml(inVersion(undefined, path))}">Go to ${escapeHtml(named)}</a>.</p>
`;
}

export interface PageOptions {
  /** What the browser tab and the search result say. */
  title: string;
  /** The one sentence a search result and a link preview show. */
  description: string;
  /**
   * Where this page sits inside one copy of the site, such as
   * `rules/indentation.html`. The version folder is not part of it: the same
   * path names the same page in every version.
   */
  path: string;
  /** Which version this build documents. */
  target: Target;
  /** What links to the stylesheet and to other pages are written relative to. */
  root: string;
  /** Which kind of thing a link preview should treat this as. */
  kind?: 'website' | 'article';
  /** What this page is, described for a search engine. */
  jsonLd?: object[];
  /** Keeps a page out of search results. */
  noindex?: boolean;
  body: string;
}

/** Wraps page content in the shared document shell. */
export function page({
  title,
  description,
  path,
  target,
  root,
  kind = 'website',
  jsonLd = [],
  noindex = false,
  body,
}: PageOptions): string {
  const card = absolute(SOCIAL_CARD.file);
  // Every version of a page names the copy at the root as the one to index.
  // Without it the same rule, published once per release, reads to a search
  // engine as a dozen pages competing with each other.
  const url = canonical(path);
  const robots = noindex
    ? 'noindex, follow'
    : 'index, follow, max-image-preview:large, max-snippet:-1';

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="author" content="${escapeHtml(AUTHOR)}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${escapeHtml(url)}">

<meta property="og:type" content="${kind}">
<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
<meta property="og:locale" content="en_GB">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:image" content="${escapeHtml(card)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="${SOCIAL_CARD.width}">
<meta property="og:image:height" content="${SOCIAL_CARD.height}">
<meta property="og:image:alt" content="${escapeHtml(`${SITE_NAME} - ${TAGLINE}`)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(card)}">

<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f6f7f9">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#14171a">
<link rel="stylesheet" href="${root}/style.css">
<link rel="icon" href="${root}/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${root}/apple-touch-icon.png">
<link rel="sitemap" type="application/xml" href="${absolute('sitemap.xml')}">${structuredData(jsonLd)}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${archivedNotice(path, target)}${body}
<footer>
<p>${escapeHtml(SITE_NAME)} ${escapeHtml(version())} &middot; free software under the ${escapeHtml(LICENCE)} licence</p>
<p><a href="${REPO_URL}">Source on GitHub</a> &middot;
<a href="${REPO_URL}/issues">Report an issue</a> &middot;
<a href="${NPM_URL}">Package on npm</a></p>
</footer>
</body>
</html>
`;
}

/** The site described to a search engine, reused by every page. */
export function websiteBlock(): object {
  return {
    '@type': 'WebSite',
    name: SITE_NAME,
    url: absolute(''),
    description: TAGLINE,
  };
}

/** The tool itself described to a search engine. */
export function applicationBlock(description: string): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    description,
    url: absolute(''),
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Linux, macOS, Windows',
    softwareVersion: version(),
    codeRepository: REPO_URL,
    downloadUrl: NPM_URL,
    license: `https://spdx.org/licenses/${LICENCE}.html`,
    author: {'@type': 'Person', name: AUTHOR},
    offers: {'@type': 'Offer', price: '0', priceCurrency: 'EUR'},
  };
}

/** One step on the trail from the home page to the page you are on. */
export interface Crumb {
  name: string;
  /** The path inside the site, or `''` for the home page. */
  path: string;
}

/** The trail described to a search engine, which shows it above a result. */
export function breadcrumbBlock(trail: Crumb[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: canonical(crumb.path),
    })),
  };
}
