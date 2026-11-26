import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {inline, renderMarkdown} from '../site/markdown.ts';

test('a code span keeps its text exactly, markup and all', () => {
  assert.equal(inline('use `**not bold** <b>`'), 'use <code>**not bold** &lt;b&gt;</code>');
});

test('bold may hold a code span', () => {
  assert.equal(
    inline('**`indentation` now checks.**'),
    '<strong><code>indentation</code> now checks.</strong>',
  );
});

test('a run of backticks with no partner is plain text', () => {
  assert.equal(
    inline('opening (""" or ```) against a `docstring` setting'),
    'opening (&quot;&quot;&quot; or ```) against a <code>docstring</code> setting',
  );
});

test('a link becomes a link', () => {
  assert.equal(inline('see [the guide](https://example.org/a?b&c)'),
    'see <a href="https://example.org/a?b&amp;c">the guide</a>');
});

test('the title, the intro and the sections come apart', () => {
  const rendered = renderMarkdown('# Title\n\nFirst\nline.\n\n## One\n\nBody.\n');
  assert.equal(rendered.title, 'Title');
  assert.equal(rendered.intro, '<p>First line.</p>');
  assert.equal(rendered.body, '<h2>One</h2>\n<p>Body.</p>');
});

test('fenced code is escaped and left as it is, blank lines included', () => {
  const {body} = renderMarkdown('## A\n\n```diff\n-<old>\n\n+**new**\n```\n');
  assert.equal(body, '<h2>A</h2>\n<pre><code>-&lt;old&gt;\n\n+**new**</code></pre>');
});

test('a list item carries on over its indented lines', () => {
  const {body} = renderMarkdown('## A\n\n- one\n  more\n- two\n\nAfter.\n');
  assert.equal(body, '<h2>A</h2>\n<ul><li>one more</li><li>two</li></ul>\n<p>After.</p>');
});

test('every section of MIGRATING.md makes it onto the page', () => {
  const source = fs.readFileSync(path.join(import.meta.dirname, '..', 'MIGRATING.md'), 'utf8');
  const {title, body} = renderMarkdown(source);
  assert.equal(title, 'Migrating from gherkin-lint');
  const sections = [...source.matchAll(/^## (.*)$/gm)].map((match) => match[1] ?? '');
  assert.ok(sections.length > 5);
  for (const section of sections) {
    assert.ok(body.includes(`<h2>${section}</h2>`), `missing section: ${section}`);
  }
  // Nothing in it is left half-rendered.
  assert.doesNotMatch(body.replace(/<pre>[\s\S]*?<\/pre>/g, ''), /\*\*|^#|\]\(/m);
});
