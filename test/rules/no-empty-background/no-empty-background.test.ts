import {test} from 'node:test';
import rule from '../../../src/rules/no-empty-background.ts';
import {checkRule} from '../../helpers.ts';

test('accepts a file with no background', async () => {
  await checkRule(rule, 'no-empty-background/NoBackground.feature', {}, []);
});

test('accepts a background with steps', async () => {
  await checkRule(rule, 'no-empty-background/NoViolations.feature', {}, []);
});

test('reports a background with no steps', async () => {
  await checkRule(rule, 'no-empty-background/Violations.feature', {}, [
    {message: 'Empty backgrounds are not allowed.', line: 4},
  ]);
});
