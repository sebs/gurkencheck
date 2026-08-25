/**
 * Incomplete feature files have broken rules more than once over the years.
 * Every rule is run over each of them to check it copes.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {parseFeature} from '../src/gherkin/parse.ts';
import {BUILT_IN_RULES} from '../src/rules/index.ts';
import type {LintRule} from '../src/types.ts';

const FIXTURES = ['EmptyFeature', 'ChildlessFeature', 'SteplessFeature', 'EmptyExamples'] as const;

/** Settings that let each rule do something meaningful. */
function settingsFor(rule: LintRule): unknown {
  if (rule.name === 'new-line-at-eof') return 'yes';
  if (rule.name === 'required-tags') return {tags: []};
  return {};
}

for (const rule of BUILT_IN_RULES) {
  for (const fixture of FIXTURES) {
    test(`${rule.name} copes with ${fixture}`, () => {
      const relativePath = `test/rules/all-rules/${fixture}.feature`;
      const {feature, file} = parseFeature(relativePath, readFileSync(relativePath, 'utf8'));
      const errors = rule.run(feature, file, settingsFor(rule));
      assert.ok(Array.isArray(errors), `${rule.name} should always return an array`);
    });
  }
}
