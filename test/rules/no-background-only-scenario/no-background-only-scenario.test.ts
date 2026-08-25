import {test} from 'node:test';
import rule from '../../../src/rules/no-background-only-scenario.ts';
import {checkRule} from '../../helpers.ts';

const message = 'Backgrounds are not allowed when there is just one scenario.';

test('accepts a file with no background', () => {
  checkRule(rule, 'no-background-only-scenario/NoBackground.feature', {}, []);
});

test('accepts a background shared by several scenarios', () => {
  checkRule(rule, 'no-background-only-scenario/NoViolations.feature', {}, []);
});

test('reports a background used by a single scenario', () => {
  checkRule(rule, 'no-background-only-scenario/ViolationsScenario.feature', {}, [
    {message, line: 4},
  ]);
});

test('reports a background used by a single scenario outline', () => {
  checkRule(rule, 'no-background-only-scenario/ViolationsOutline.feature', {}, [{message, line: 4}]);
});

// https://github.com/gherkin-lint/gherkin-lint/issues/159
test('says nothing when a background has no scenarios at all', () => {
  checkRule(rule, 'no-background-only-scenario/BackgroundWithoutScenarios.feature', {}, []);
});

test('judges a background inside a rule against that rule s scenarios', () => {
  checkRule(rule, 'no-background-only-scenario/RuleWithOneScenario.feature', {}, [
    {message, line: 14},
  ]);
});
