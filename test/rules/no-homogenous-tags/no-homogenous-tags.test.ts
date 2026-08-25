import {test} from 'node:test';
import rule from '../../../src/rules/no-homogenous-tags.ts';
import {checkRule} from '../../helpers.ts';

const onFeature = (tag: string, line: number) => ({
  message: `Every Scenario on this Feature has the tag ${tag}, it should be defined on the Feature instead`,
  line,
});

const onOutline = (tag: string, line: number) => ({
  message: `Every Examples table of this Scenario Outline has the tag ${tag}, it should be defined on the Scenario Outline instead`,
  line,
});

test('accepts tags that differ between scenarios', async () => {
  await checkRule(rule, 'no-homogenous-tags/NoViolations.feature', {}, []);
});

// https://github.com/gherkin-lint/gherkin-lint/issues/170
test('reports one error per shared tag, not one summary for all of them', async () => {
  await checkRule(rule, 'no-homogenous-tags/Violations.feature', {}, [
    onFeature('@tag1', 1),
    onFeature('@tag2', 1),
    onOutline('@tag5', 11),
  ]);
});

// https://github.com/gherkin-lint/gherkin-lint/issues/231
// https://github.com/gherkin-lint/gherkin-lint/issues/257
test('says nothing about a feature holding a single scenario', async () => {
  await checkRule(rule, 'no-homogenous-tags/SingleScenario.feature', {}, []);
});

test('says nothing about a scenario outline with a single examples table', async () => {
  await checkRule(rule, 'no-homogenous-tags/SingleExamplesTable.feature', {}, []);
});
