import {test} from 'node:test';
import rule from '../../../src/rules/no-unused-variables.ts';
import {checkRule} from '../../helpers.ts';

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
