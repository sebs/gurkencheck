/**
 * The facts about the site itself: what it is called and where it lives.
 *
 * The address matters more here than it looks. A link preview on LinkedIn or
 * Slack, and a search result, are built by a machine that never loaded the
 * page in a browser, so every address it is given has to be absolute. The
 * address is read from package.json so there is one place to change it.
 */
import fs from 'node:fs';
import path from 'node:path';

interface PackageFields {
  homepage?: string;
  license?: string;
  author?: string;
  repository?: {url?: string};
}

const pkg = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf8'),
) as PackageFields;

export const SITE_NAME = 'gurkencheck';
export const TAGLINE = 'A linter for Gherkin feature files.';

/** Where the site is published, without a trailing slash. */
export const SITE_URL = (pkg.homepage ?? 'https://sebs.github.io/gurkencheck').replace(/\/+$/, '');

export const REPO_URL =
  (pkg.repository?.url ?? '').replace(/^git\+/, '').replace(/\.git$/, '') ||
  'https://github.com/sebs/gurkencheck';

export const NPM_URL = `https://www.npmjs.com/package/${SITE_NAME}`;
export const LICENCE = pkg.license ?? 'ISC';
export const AUTHOR = pkg.author ?? '';

/** The name of the preview image, and the size it was drawn at. */
export const SOCIAL_CARD = {file: 'social-card.png', width: 1200, height: 630} as const;

/** Turns a path inside the site into the absolute address it will have. */
export function absolute(relativePath: string): string {
  return relativePath === '' ? `${SITE_URL}/` : `${SITE_URL}/${relativePath}`;
}
