import {test} from 'node:test';
import rule from '../../../src/rules/keywords-in-logical-order.ts';
import {checkRule, type ExpectedError} from '../../helpers.ts';

const outOfOrder = (
  keyword: string,
  text: string,
  priorKeyword: string,
  line: number,
): ExpectedError => ({
  message: `Step "${keyword} ${text}" should not appear after step using keyword ${priorKeyword}`,
  line,
});

const violations: ExpectedError[] = [
  outOfOrder('When', 'step2', 'then', 7),
  outOfOrder('Given', 'step3', 'then', 8),
  outOfOrder('Given', 'step12', 'when', 12),
  outOfOrder('Given', 'step22', 'then', 16),
  outOfOrder('When', 'step32', 'then', 20),
  outOfOrder('When', 'step54', 'then', 26),
  outOfOrder('When', 'step42', 'then', 30),
  outOfOrder('Given', 'step43', 'then', 31),
];

test('accepts Given, When, Then in order', () => {
  checkRule(rule, 'keywords-in-logical-order/NoViolations.feature', {}, []);
});

test('accepts Given, When, Then in order inside rules', () => {
  checkRule(rule, 'keywords-in-logical-order/NoViolationsUsingRules.feature', {}, []);
});

test('reports keywords that go backwards', () => {
  checkRule(rule, 'keywords-in-logical-order/Violations.feature', {}, violations);
});

test('reports keywords that go backwards inside rules', () => {
  checkRule(rule, 'keywords-in-logical-order/ViolationsUsingRules.feature', {}, violations);
});
