import {test} from 'node:test';
import rule from '../../../src/rules/no-unused-variables.ts';
import {checkRule} from '../../helpers.ts';

test('accepts variables that are both declared and used', () => {
  checkRule(rule, 'no-unused-variables/NoViolations.feature', {}, []);
});

test('reports step variables missing from the examples table', () => {
  checkRule(
    rule,
    'no-unused-variables/UnusedStepVariables.feature',
    {},
    [5, 12, 18, 30, 41].map((line) => ({
      message: 'Step variable "b" does not exist in the examples table',
      line,
    })),
  );
});

test('reports examples columns that no step uses', () => {
  checkRule(
    rule,
    'no-unused-variables/UnusedExampleVariables.feature',
    {},
    [7, 14, 26, 35, 49, 61].map((line) => ({
      message: 'Examples table variable "b" is not used in any step',
      line,
    })),
  );
});
