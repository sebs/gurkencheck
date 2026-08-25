import {test} from 'node:test';
import rule from '../../../src/rules/no-files-without-scenarios.ts';
import {checkRule} from '../../helpers.ts';

const message = 'Feature file does not have any Scenarios';

for (const fixture of [
  'FeatureWithScenario',
  'FeatureWithRuleAndScenario',
  'FeatureWithScenarioOutline',
  'FeatureWithRuleAndScenarioOutline',
]) {
  test(`accepts ${fixture}`, () => {
    checkRule(rule, `no-files-without-scenarios/${fixture}.feature`, {}, []);
  });
}

test('reports a feature with no scenarios', () => {
  checkRule(rule, 'no-files-without-scenarios/Violations.feature', {}, [{message, line: 1}]);
});

test('reports a feature whose rules have no scenarios', () => {
  checkRule(rule, 'no-files-without-scenarios/ViolationsWithRule.feature', {}, [{message, line: 1}]);
});
