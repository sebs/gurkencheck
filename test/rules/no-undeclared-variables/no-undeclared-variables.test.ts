import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseFeature} from '../../../src/gherkin/parse.ts';
import {newRunContext} from '../../../src/rules.ts';
import rule from '../../../src/rules/no-undeclared-variables.ts';
import {checkRule} from '../../helpers.ts';

const undeclared = (variable: string, line: number) => ({
  message: `Step variable "${variable}" does not exist in the examples table`,
  line,
});

test('accepts variables the examples table declares', async () => {
  await checkRule(rule, 'no-undeclared-variables/NoViolations.feature', {}, []);
});

// https://github.com/gherkin-lint/gherkin-lint/issues/160
test('reports step variables missing from the examples table', async () => {
  await checkRule(
    rule,
    'no-undeclared-variables/UnusedStepVariables.feature',
    {},
    // The last is in a doc string, reported on its own line rather than the
    // step's. Line 18 is the Outline's own name, and says so.
    [
      ...[5, 12, 30, 43].map((line) => undeclared('b', line)),
      {message: 'Scenario Outline name variable "b" does not exist in the examples table', line: 18},
    ],
  );
});

// https://github.com/gherkin-lint/gherkin-lint/issues/175
test('reports every line an undeclared variable appears on', async () => {
  await checkRule(rule, 'no-undeclared-variables/RepeatedVariables.feature', {}, [
    undeclared('b', 5),
    undeclared('b', 6),
    undeclared('b', 7),
  ]);
});

test('says nothing about an unused examples column', async () => {
  // That is no-unused-variables' job.
  await checkRule(rule, 'no-undeclared-variables/RepeatedVariables.feature', {}, [
    undeclared('b', 5),
    undeclared('b', 6),
    undeclared('b', 7),
  ]);
});

test('reports a variable that one of several Examples tables leaves out', async () => {
  await checkRule(rule, 'no-undeclared-variables/SomeTables.feature', {}, [
    {message: 'Step variable "b" does not exist in the examples table on line 10', line: 4},
  ]);
});

test('takes only placeholder-shaped text as a variable, and places doc string ones on their line', async () => {
  await checkRule(rule, 'no-undeclared-variables/AngleBrackets.feature', {}, [
    {message: 'Step variable "b" does not exist in the examples table', line: 8},
  ]);
});

test('places a variable at its own column, and names an Outline name as one', async () => {
  const source = [
    'Feature: A',
    '  Scenario Outline: Buy <count> of <item>',
    '    Given I have <count> and <colour>',
    '    Examples:',
    '      | count |',
    '      | 1     |',
  ].join('\n');
  const {feature, file} = parseFeature('a.feature', source);
  const errors = await rule.run(feature, file, undefined, newRunContext());
  assert.deepEqual(
    errors.map(({message, line, column}) => [message, line, column]),
    [
      ['Scenario Outline name variable "item" does not exist in the examples table', 2, 36],
      ['Step variable "colour" does not exist in the examples table', 3, 30],
    ],
  );
});
