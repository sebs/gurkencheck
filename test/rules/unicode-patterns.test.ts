/**
 * The rules taking patterns read them with the u flag.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseFeature} from '../../src/gherkin/parse.ts';
import {newRunContext} from '../../src/rules.ts';
import allowedTags from '../../src/rules/allowed-tags.ts';
import noRestrictedPatterns from '../../src/rules/no-restricted-patterns.ts';
import noRestrictedTags from '../../src/rules/no-restricted-tags.ts';
import requiredTags from '../../src/rules/required-tags.ts';
import type {LintRule} from '../../src/types.ts';

const SOURCE = '@Wip @🚧\nFeature: Straße\n\n  Scenario: Ünterwegs\n    Given a step\n';

async function messages(rule: LintRule, settings: unknown): Promise<string[]> {
  const {feature, file} = parseFeature('a.feature', SOURCE);
  const errors = await rule.run(feature, file, settings, newRunContext());
  return errors.map((error) => error.message);
}

test('no-restricted-tags bans by a Unicode class, and an emoji with .', async () => {
  assert.equal((await messages(noRestrictedTags, {tags: [], patterns: ['^@\\p{Lu}', '^@.$']})).length, 2);
});

test('allowed-tags allows by a Unicode class', async () => {
  assert.deepEqual(await messages(allowedTags, {tags: [], patterns: ['^@\\p{Lu}', '^@.$']}), []);
});

test('required-tags finds a tag by a Unicode class', async () => {
  assert.deepEqual(await messages(requiredTags, {tags: ['^@\\p{Lu}\\p{Ll}+$']}), []);
});

test('no-restricted-patterns matches by a Unicode class', async () => {
  const found = await messages(noRestrictedPatterns, {Scenario: ['^\\p{Lu}nter']});
  assert.equal(found.length, 1);
});
