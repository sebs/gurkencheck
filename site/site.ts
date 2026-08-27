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

/**
 * What one build of the site documents.
 *
 * The site is published twice over: the latest docs at the root, and a frozen
 * copy of every release under its own version number. Both are built by this
 * generator; only the label on them differs.
 */
export interface Target {
  /** The version being documented, such as `0.0.5`. */
  version: string;
  /** True for the copy at the site root, false for an archived version. */
  latest: boolean;
  /**
   * Every published version, newest first.
   *
   * Empty when a build does not know - a plain `npm run docs` - which leaves
   * the version picker out rather than showing a list of one.
   */
  published: readonly string[];
}

/**
 * The address a page has in one version of the docs.
 *
 * `undefined` is the copy at the root, which is whatever was released last.
 */
export function inVersion(version: string | undefined, filePath: string): string {
  return absolute(version === undefined ? filePath : `${version}/${filePath}`);
}

/** The name of the preview image, and the size it was drawn at. */
export const SOCIAL_CARD = {file: 'social-card.png', width: 1200, height: 630} as const;

/** Turns a path inside the site into the absolute address it will have. */
export function absolute(relativePath: string): string {
  return relativePath === '' ? `${SITE_URL}/` : `${SITE_URL}/${relativePath}`;
}

/**
 * The address a page is indexed under.
 *
 * A directory and the `index.html` inside it are the same page. Dropping the
 * file name in one place stops a search engine treating them as two.
 */
export function canonical(filePath: string): string {
  return absolute(filePath.replace(/(^|\/)index\.html$/, '$1'));
}
