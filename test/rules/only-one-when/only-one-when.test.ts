import {test} from 'node:test';
import rule from '../../../src/rules/only-one-when.ts';
import {checkRule, type ExpectedError} from '../../helpers.ts';

const tooMany = (scenario: string, count: number, line: number): ExpectedError => ({
  message: `Scenario "${scenario}" contains ${count} When statements (max 1)`,
  line,
});

const violations: ExpectedError[] = [
  tooMany('When, When', 2, 7),
  tooMany('When, And', 2, 11),
  tooMany('Given, When, And, Then', 2, 16),
  tooMany('Outline Given, When, And, Then', 2, 22),
  tooMany('Given, When, When, And, Then', 3, 31),
  tooMany('Given, When, Then, When, And', 3, 39),
];

test('accepts scenarios with a single When', () => {
  checkRule(rule, 'only-one-when/NoViolations.feature', {}, []);
});

test('accepts scenarios with a single When inside rules', () => {
  checkRule(rule, 'only-one-when/NoViolationsUsingRules.feature', {}, []);
});

test('reports scenarios with more than one When', () => {
  checkRule(rule, 'only-one-when/Violations.feature', {}, violations);
});

test('reports scenarios with more than one When inside rules', () => {
  checkRule(rule, 'only-one-when/ViolationsUsingRules.feature', {}, violations);
});
