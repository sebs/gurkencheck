/**
 * A `Rule:` adds a level to the tree, and a rule that walks `feature.children`
 * by hand never reaches what is inside one. That went unnoticed because the
 * blindness is silent: the file simply comes back clean.
 *
 * Every rule is run over the same mistakes written twice - once directly under
 * the Feature, once inside a `Rule:` - and has to report the same thing both
 * times. The fixtures are indented identically so that even the messages
 * quoting an indentation level match.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {parseFeature} from '../../src/gherkin/parse.ts';
import {BUILT_IN_RULES} from '../../src/rules/index.ts';
import type {LintRule} from '../../src/types.ts';

/** Settings that give each rule something to find in the fixtures. */
function settingsFor(rule: LintRule): unknown {
  switch (rule.name) {
    case 'allowed-tags':
      return {tags: ['@feat']};
    case 'file-name':
      return {style: 'kebab-case'};
    case 'new-line-at-eof':
      return 'yes';
    case 'no-dupe-scenario-names':
      return 'in-feature';
    case 'no-restricted-tags':
      return {tags: ['@dupe']};
    case 'required-tags':
      return {tags: ['^@must-'], ignoreUntagged: false};
    default:
      return {};
  }
}

/** The messages a rule reports for one fixture, with any state reset first. */
async function messagesFor(rule: LintRule, fixture: string): Promise<string[]> {
  rule.reset?.();
  const relativePath = `test/rules/inside-rule/${fixture}.feature`;
  const {feature, file} = parseFeature(relativePath, readFileSync(relativePath, 'utf8'));
  const errors = await rule.run(feature, file, settingsFor(rule));
  return errors.map((error) => error.message).sort();
}

for (const rule of BUILT_IN_RULES) {
  test(`${rule.name} sees inside a Rule`, async () => {
    const flat = await messagesFor(rule, 'at-feature-level');
    const nested = await messagesFor(rule, 'inside-a-rule');
    assert.deepEqual(nested, flat);
  });
}

test('the fixtures are worth comparing', async () => {
  const reported = new Set<string>();
  for (const rule of BUILT_IN_RULES) {
    if ((await messagesFor(rule, 'inside-a-rule')).length > 0) {
      reported.add(rule.name);
    }
  }
  // Named rather than counted, so that a rule going quiet names itself.
  assert.deepEqual(
    [...reported].sort(),
    [
      'allowed-tags',
      'indentation',
      'no-duplicate-tags',
      'no-empty-background',
      'no-homogenous-tags',
      'no-partially-commented-tag-lines',
      'no-restricted-tags',
      'no-scenarios-without-then',
      'no-scenarios-without-when',
      'no-superfluous-tags',
      'no-unnamed-scenarios',
      'one-space-between-tags',
      'required-tags',
    ],
  );
});
