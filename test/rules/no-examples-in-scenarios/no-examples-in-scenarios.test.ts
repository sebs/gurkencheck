import {test} from 'node:test';
import rule from '../../../src/rules/no-examples-in-scenarios.ts';
import {checkRule} from '../../helpers.ts';

test('accepts examples on a scenario outline', async () => {
  await checkRule(rule, 'no-examples-in-scenarios/NoViolations.feature', {}, []);
});

test('reports examples on a plain scenario', async () => {
  await checkRule(rule, 'no-examples-in-scenarios/Violations.feature', {}, [
    {
      message: 'Cannot use "Examples" in a "Scenario", use a "Scenario Outline" instead',
      line: 6,
    },
  ]);
});
