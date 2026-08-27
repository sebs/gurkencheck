/**
 * Adds the canonical link that a release's own generator never wrote.
 *
 * The docs are published once per release, so a rule documented across a
 * dozen releases exists at a dozen addresses. Every copy names the one at the
 * site root as the page to index, which is what stops them competing with
 * each other in a search result.
 *
 * The generator does that itself now. Releases tagged before it did are fixed
 * up here instead, after their docs have been built from their own tag. The
 * pass is idempotent - a page that already names a canonical is left alone -
 * so it quietly becomes a no-op as those releases fall out of the list.
 *
 * Run it with `node scripts/canonicalise-docs.ts <directory> <version>`.
 */
import fs from 'node:fs';
import path from 'node:path';
import {SITE_NAME, canonical, inVersion} from '../site/site.ts';

/** Enough styling for the notice to look deliberate in either theme. */
const NOTICE_STYLE =
  '<style>p.archived{margin:0;padding:.6rem 1.5rem;text-align:center;font-size:.9rem;' +
  'background:#e8f2ec;color:#2f6f4f;border-bottom:1px solid #dfe3e8}' +
  'p.archived a{color:inherit}' +
  '@media(prefers-color-scheme:dark){p.archived{background:#1d2a24;color:#7fc7a1;' +
  'border-bottom-color:#2c333a}}</style>';

/** Every HTML file in a directory, however deep. */
function htmlFilesIn(directory: string, prefix = ''): string[] {
  const found: string[] = [];

  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...htmlFilesIn(path.join(directory, entry.name), relativePath));
    } else if (entry.name.endsWith('.html')) {
      found.push(relativePath);
    }
  }

  return found;
}

/**
 * Points every page in one version's docs at the copy of it at the site root,
 * and says so in the page as well. Returns the files it changed.
 */
export function canonicalise(directory: string, version: string): string[] {
  const changed: string[] = [];

  for (const relativePath of htmlFilesIn(directory)) {
    const filePath = path.join(directory, relativePath);
    const html = fs.readFileSync(filePath, 'utf8');
    let updated = html;

    // Two separate gaps, because a release can have closed one and not the
    // other: the canonical link arrived a version before the notice did.
    if (!updated.includes('rel="canonical"')) {
      updated = updated.replace(
        '</head>',
        `<link rel="canonical" href="${canonical(relativePath)}">\n</head>`,
      );
    }

    if (!updated.includes('class="archived"')) {
      updated = updated
        .replace('</head>', `${NOTICE_STYLE}\n</head>`)
        .replace(
          '<body>',
          `<body>\n<p class="archived">You are reading the documentation for ` +
            `${SITE_NAME} ${version}. ` +
            `<a href="${inVersion(undefined, relativePath)}">Go to the latest version</a>.</p>`,
        );
    }

    // Nothing to add, or no head and body to add it to.
    if (updated === html) {
      continue;
    }

    fs.writeFileSync(filePath, updated);
    changed.push(relativePath);
  }

  return changed;
}

if (import.meta.filename === process.argv[1]) {
  const [directory, version] = process.argv.slice(2);
  if (directory === undefined || version === undefined) {
    console.error('usage: node scripts/canonicalise-docs.ts <directory> <version>');
    process.exit(2);
  }

  const changed = canonicalise(directory, version);
  console.log(
    changed.length === 0
      ? `${directory} needed nothing adding`
      : `Filled in the version notice on ${changed.length} pages in ${directory}`,
  );
}
