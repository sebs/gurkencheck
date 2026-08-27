/**
 * Guards the parts of the generated site that nothing else looks at.
 *
 * A broken link or a missing preview tag does not fail a build and does not
 * show up in a screenshot: it shows up weeks later as a bare link in somebody
 * else's feed, or as a page a search engine quietly dropped. So it is checked
 * here instead.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {build} from '../site/build.ts';
import {RULE_DOCS} from '../site/content.ts';
import {SITE_URL, SOCIAL_CARD} from '../site/site.ts';

/** Builds the site once into a temporary directory and reads it all back. */
function site(): {directory: string; pages: Map<string, string>; written: string[]} {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-site-'));
  const written = build(directory);
  const pages = new Map(
    written
      .filter((file) => file.endsWith('.html'))
      .map((file) => [file, fs.readFileSync(path.join(directory, file), 'utf8')]),
  );
  return {directory, pages, written};
}

const {directory, pages, written} = site();

/** The value of a meta tag, whichever attribute names it. */
function meta(html: string, name: string): string | undefined {
  const pattern = new RegExp(
    `<meta (?:name|property)="${name}" content="([^"]*)"`,
    'i',
  );
  return pattern.exec(html)?.[1];
}

test('every page says enough for a link preview to be worth showing', () => {
  for (const [file, html] of pages) {
    for (const tag of ['og:title', 'og:description', 'og:type', 'og:site_name']) {
      assert.ok((meta(html, tag) ?? '').length > 0, `${file} has no ${tag}`);
    }
    assert.equal(meta(html, 'twitter:card'), 'summary_large_image', `${file} preview is small`);

    // A preview is fetched by a machine that never loaded the page, so every
    // address it is handed has to stand on its own.
    for (const tag of ['og:url', 'og:image', 'twitter:image']) {
      const value = meta(html, tag) ?? '';
      assert.ok(value.startsWith(`${SITE_URL}/`), `${file} has a relative ${tag}: ${value}`);
    }
  }
});

test('the preview image is a PNG of the size the tags promise', () => {
  const bytes = fs.readFileSync(path.join(directory, SOCIAL_CARD.file));
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'not a PNG');
  assert.equal(bytes.readUInt32BE(16), SOCIAL_CARD.width);
  assert.equal(bytes.readUInt32BE(20), SOCIAL_CARD.height);
});

test('every page names the address it should be indexed under', () => {
  for (const [file, html] of pages) {
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
    const expected =
      file === '404.html' ? `${SITE_URL}/404.html` : `${SITE_URL}/${file.replace(/index\.html$/, '')}`;
    assert.equal(canonical, expected, `${file} points somewhere else`);
  }
});

test('the page that is not a page is kept out of search results', () => {
  assert.match(pages.get('404.html') ?? '', /<meta name="robots" content="noindex/);
  for (const [file, html] of pages) {
    if (file === '404.html') continue;
    assert.match(html, /<meta name="robots" content="index/, `${file} is not indexable`);
  }
});

test('the 404 page works from any address it might be served at', () => {
  // GitHub Pages serves it for a missing path at any depth, so a relative
  // link on it would point at a directory the reader was never in.
  const html = pages.get('404.html') ?? '';
  const body = html.slice(html.indexOf('<body>'));
  for (const match of body.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const target = match[1] ?? '';
    assert.ok(
      /^(https?:|#)/.test(target),
      `the 404 page links to ${target}, which depends on where it is served from`,
    );
  }
});

test('every link inside the site goes somewhere', () => {
  for (const [file, html] of pages) {
    const from = path.dirname(file);
    for (const match of html.matchAll(/(?:href|src)="([^"#][^"]*)"/g)) {
      const target = match[1] ?? '';
      if (/^(https?:|mailto:|data:)/.test(target)) continue;
      const relativePath = target.split('#')[0] ?? '';
      assert.ok(
        fs.existsSync(path.join(directory, from, relativePath)),
        `${file} links to ${target}, which was never written`,
      );
    }
  }
});

test('every link to a section on the same page lands on one', () => {
  for (const [file, html] of pages) {
    for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) {
      assert.ok(html.includes(`id="${id}"`), `${file} links to #${id}, which is not there`);
    }
  }
});

test('no two sections on a page share an id', () => {
  for (const [file, html] of pages) {
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(([, id]) => id);
    assert.equal(new Set(ids).size, ids.length, `${file} uses an id twice`);
  }
});

test('the sitemap lists every page a reader can land on, and nothing else', () => {
  const sitemap = fs.readFileSync(path.join(directory, 'sitemap.xml'), 'utf8');
  const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url).sort();

  const expected = [
    `${SITE_URL}/`,
    `${SITE_URL}/rules/`,
    ...RULE_DOCS.map((rule) => `${SITE_URL}/rules/${rule.name}.html`),
  ].sort();

  assert.deepEqual(listed, expected);
  assert.ok(!sitemap.includes('404'), 'a page that is not there should not be advertised');
});

test('robots.txt points at the sitemap', () => {
  const robots = fs.readFileSync(path.join(directory, 'robots.txt'), 'utf8');
  assert.match(robots, new RegExp(`Sitemap: ${SITE_URL}/sitemap.xml`));
});

test('every rule page describes itself to a search engine', () => {
  for (const rule of RULE_DOCS) {
    const html = pages.get(`rules/${rule.name}.html`) ?? '';
    const json = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1];
    assert.ok(json !== undefined, `${rule.name} has no structured data`);

    const blocks = JSON.parse(json.replaceAll('\\u003c', '<')) as {'@type': string}[];
    const types = blocks.map((block) => block['@type']);
    assert.deepEqual(types, ['TechArticle', 'BreadcrumbList'], `${rule.name} describes itself oddly`);
  }
});

test('structured data cannot break out of the script tag it sits in', () => {
  for (const [file, html] of pages) {
    const json = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
    assert.ok(!json.includes('<'), `${file} has an unescaped < in its structured data`);
  }
});

test('the assets the pages ask for are copied in', () => {
  for (const asset of ['style.css', 'icon.svg', 'apple-touch-icon.png', SOCIAL_CARD.file]) {
    assert.ok(written.includes(asset), `${asset} was not written`);
  }
});

test('every page links to the source on GitHub', () => {
  for (const [file, html] of pages) {
    assert.ok(html.includes('https://github.com/sebs/gurkencheck"'), `${file} does not link to GitHub`);
  }
});
