import {test} from 'node:test';
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
    [5, 12, 18, 30, 41].map((line) => undeclared('b', line)),
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
