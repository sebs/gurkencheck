import {test} from 'node:test';
import rule from '../../../src/rules/background-setup-only.ts';
import {checkRule, type ExpectedError} from '../../helpers.ts';

const notSetup = (step: string, line: number): ExpectedError => ({
  message: `Step "${step}" is not a setup step, and a Background only sets things up`,
  line,
});

const violations: ExpectedError[] = [
  notSetup('When step7', 7),
  // The And carries on from the When above it, so it is not setup either.
  notSetup('And step8', 8),
  notSetup('Then step9', 9),
];

test('accepts a Background of nothing but setup', async () => {
  await checkRule(rule, 'background-setup-only/NoViolations.feature', {}, []);
});

test('accepts a Background of nothing but setup inside a rule', async () => {
  await checkRule(rule, 'background-setup-only/NoViolationsUsingRules.feature', {}, []);
});

test('reports the steps in a Background that do more than set up', async () => {
  await checkRule(rule, 'background-setup-only/Violations.feature', {}, violations);
});

test('reports them inside a rule too', async () => {
  await checkRule(rule, 'background-setup-only/ViolationsUsingRules.feature', {}, violations);
});
