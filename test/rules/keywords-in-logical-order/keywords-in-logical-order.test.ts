import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseFeature} from '../../../src/gherkin/parse.ts';
import {newRunContext} from '../../../src/rules.ts';
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
  outOfOrder('When', 'step2', 'Then', 7),
  outOfOrder('Given', 'step3', 'Then', 8),
  outOfOrder('Given', 'step12', 'When', 12),
  outOfOrder('Given', 'step22', 'Then', 16),
  outOfOrder('When', 'step32', 'Then', 20),
  outOfOrder('When', 'step54', 'Then', 26),
  outOfOrder('When', 'step42', 'Then', 30),
  outOfOrder('Given', 'step43', 'Then', 31),
];

test('accepts Given, When, Then in order', async () => {
  await checkRule(rule, 'keywords-in-logical-order/NoViolations.feature', {}, []);
});

test('accepts Given, When, Then in order inside rules', async () => {
  await checkRule(rule, 'keywords-in-logical-order/NoViolationsUsingRules.feature', {}, []);
});

test('reports keywords that go backwards', async () => {
  await checkRule(rule, 'keywords-in-logical-order/Violations.feature', {}, violations);
});

test('reports keywords that go backwards inside rules', async () => {
  await checkRule(rule, 'keywords-in-logical-order/ViolationsUsingRules.feature', {}, violations);
});

test('takes a * step as carrying on from the step before it', async () => {
  await checkRule(rule, 'keywords-in-logical-order/StarSteps.feature', {}, []);
});

test('names the keyword it went back from as the file writes it', async () => {
  const {feature, file} = parseFeature(
    'fr.feature',
    '# language: fr\nFonctionnalité: A\n  Scénario: B\n    Alors x\n    Quand y\n',
  );
  const errors = await rule.run(feature, file, undefined, newRunContext());
  assert.deepEqual(
    errors.map((error) => error.message),
    ['Step "Quand y" should not appear after step using keyword Alors'],
  );
});
