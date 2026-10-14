import assert from 'node:assert/strict';
import {test} from 'node:test';
import rule from '../../../src/rules/no-unused-variables.ts';
import {checkRule, runRule} from '../../helpers.ts';

const unused = (variable: string, line: number) => ({
  message: `Examples table variable "${variable}" is not used in any step`,
  line,
});

test('accepts columns that a step uses', async () => {
  await checkRule(rule, 'no-unused-variables/NoViolations.feature', {}, []);
});

test('reports examples columns that no step uses', async () => {
  await checkRule(
    rule,
    'no-unused-variables/UnusedExampleVariables.feature',
    {},
    [7, 14, 26, 35, 49, 61].map((line) => unused('b', line)),
  );
});

// https://github.com/gherkin-lint/gherkin-lint/issues/175
test('reports every examples table declaring the unused column', async () => {
  await checkRule(rule, 'no-unused-variables/RepeatedVariables.feature', {}, [
    unused('b', 17),
    unused('b', 21),
  ]);
});

// https://github.com/gherkin-lint/gherkin-lint/issues/160
test('says nothing about a step variable missing from the table', async () => {
  // That is no-undeclared-variables' job.
  await checkRule(rule, 'no-undeclared-variables/UnusedStepVariables.feature', {}, []);
});

test('a column whose name holds a quote or = is used where its <name> is', async () => {
  await checkRule(rule, 'no-unused-variables/UnusualColumns.feature', {}, []);
});

test('places a cell after an emoji at its column in characters', async () => {
  const errors = await runRule(rule, 'no-unused-variables/EmojiCells.feature');
  const columns = Object.fromEntries(errors.map((error) => [error.message, error.column]));
  // | 🚀 | x | unused |: unused starts at the 17th character.
  assert.equal(columns['Examples table variable "unused" is not used in any step'], 17);
});
