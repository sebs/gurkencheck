/**
 * Guards against the three lists of rules drifting apart: the modules on
 * disk, the generated registry, and the documentation site.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {findRuleNames, renderRegistry} from '../scripts/generate-rules.ts';
import {PARSER_RULES} from '../src/gherkin/parse.ts';
import {BUILT_IN_RULES} from '../src/rules/index.ts';
import {build} from '../site/build.ts';
import {RULE_DOCS} from '../site/content.ts';

const registered = BUILT_IN_RULES.map((rule) => rule.name).sort();
const documented = RULE_DOCS.map((rule) => rule.name).sort();

test('every rule module is registered', () => {
  assert.deepEqual(registered, findRuleNames());
});

test('src/rules/index.ts is up to date - run npm run generate:rules', () => {
  assert.equal(fs.readFileSync('src/rules/index.ts', 'utf8'), renderRegistry(findRuleNames()));
});

test('rule names are unique', () => {
  assert.equal(new Set(registered).size, registered.length);
});

test('every rule is documented, and nothing extra is', () => {
  const parserRules = PARSER_RULES.filter((name) => name !== 'unexpected-error');
  assert.deepEqual(documented, [...registered, ...parserRules].sort());
});

test('every documented rule has both an example that passes and one that fails', () => {
  for (const rule of RULE_DOCS) {
    assert.ok(rule.summary.length > 0, `${rule.name} needs a summary`);
    assert.ok(rule.explanation.length > 0, `${rule.name} needs an explanation`);
    assert.ok(rule.good.length > 0, `${rule.name} needs an example that passes`);
    assert.ok(rule.bad.length > 0, `${rule.name} needs an example that fails`);
    assert.ok(rule.message.length > 0, `${rule.name} needs the message it reports`);
    assert.notEqual(rule.good, rule.bad, `${rule.name} examples should differ`);
  }
});

test('every setting a rule accepts is documented', () => {
  for (const rule of BUILT_IN_RULES) {
    const {availableConfigs} = rule;
    if (availableConfigs === undefined || Array.isArray(availableConfigs)) {
      // Rules taking a single value document it as "the value".
      continue;
    }
    const documentedNames = new Set(
      RULE_DOCS.find((doc) => doc.name === rule.name)?.settings?.map((setting) => setting.name),
    );
    for (const setting of Object.keys(availableConfigs as Record<string, unknown>)) {
      const nested = [...documentedNames].some((name) => name.endsWith(`.${setting}`));
      assert.ok(
        documentedNames.has(setting) || nested || setting === 'steps-length',
        `${rule.name} does not document its "${setting}" setting`,
      );
    }
  }
});

test('the site builds a page for every rule', () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-site-'));
  try {
    const written = build(output);
    for (const rule of RULE_DOCS) {
      assert.ok(written.includes(`rules/${rule.name}.html`), `no page for ${rule.name}`);
    }
    assert.ok(written.includes('index.html'));
    assert.ok(written.includes('style.css'));

    const index = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
    for (const rule of RULE_DOCS) {
      assert.ok(index.includes(`rules/${rule.name}.html`), `${rule.name} missing from the index`);
    }
  } finally {
    fs.rmSync(output, {recursive: true, force: true});
  }
});
