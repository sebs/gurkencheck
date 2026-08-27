import {test} from 'node:test';
import rule from '../../../src/rules/no-scenarios-without-when.ts';
import {checkRule, type ExpectedError} from '../../helpers.ts';

const missing = (scenario: string, line: number, type = 'Scenario'): ExpectedError => ({
  message: `${type} "${scenario}" does not have a When step`,
  line,
});

const violations: ExpectedError[] = [
  missing('Given and Then only', 5),
  missing('Given only', 9),
  missing('Outline with no action', 12, 'Scenario Outline'),
];

test('accepts scenarios that have one', async () => {
  await checkRule(rule, 'no-scenarios-without-when/NoViolations.feature', {}, []);
});

test('accepts scenarios that have one inside rules', async () => {
  await checkRule(rule, 'no-scenarios-without-when/NoViolationsUsingRules.feature', {}, []);
});

test('reports scenarios without one', async () => {
  await checkRule(rule, 'no-scenarios-without-when/Violations.feature', {}, violations);
});

test('reports scenarios without one inside rules', async () => {
  await checkRule(rule, 'no-scenarios-without-when/ViolationsUsingRules.feature', {}, violations);
});

test('a When in the Background counts by default', async () => {
  await checkRule(rule, 'no-scenarios-without-when/NoViolations.feature', {countBackground: true}, []);
});

test('countBackground off wants every scenario to stand on its own', async () => {
  await checkRule(rule, 'no-scenarios-without-when/NoViolations.feature', {countBackground: false}, [
    missing('Leans on the Background', 14),
  ]);
});

test('countBackground off reaches a Background inside a rule', async () => {
  await checkRule(rule, 'no-scenarios-without-when/NoViolationsUsingRules.feature', {countBackground: false}, [
    missing('Leans on the Background', 14),
  ]);
});
