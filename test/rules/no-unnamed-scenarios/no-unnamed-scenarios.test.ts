import {test} from 'node:test';
import rule from '../../../src/rules/no-unnamed-scenarios.ts';
import {checkRule} from '../../helpers.ts';

const message = 'Missing Scenario name';

test('accepts named scenarios', () => {
  checkRule(rule, 'no-unnamed-scenarios/NoViolations.feature', {}, []);
});

test('accepts a feature with no scenarios at all', () => {
  checkRule(rule, 'no-unnamed-scenarios/FeatureWithNoScenarios.feature', {}, []);
});

test('reports scenarios with no name', () => {
  checkRule(rule, 'no-unnamed-scenarios/Violations.feature', {}, [
    {message, line: 3},
    {message, line: 6},
  ]);
});
