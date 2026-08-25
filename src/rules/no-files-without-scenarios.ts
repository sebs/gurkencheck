import type {FeatureChild, RuleChild} from '@cucumber/messages';
import type {LintRule} from '../types.ts';

const name = 'no-files-without-scenarios';

function hasScenario(child: FeatureChild | RuleChild): boolean {
  if (child.scenario !== undefined) {
    return true;
  }
  return 'rule' in child && child.rule !== undefined && child.rule.children.some(hasScenario);
}

const rule: LintRule = {
  name,
  run(feature) {
    if (feature === undefined || feature.children.some(hasScenario)) {
      return [];
    }
    return [{message: 'Feature file does not have any Scenarios', rule: name, line: 1}];
  },
};

export default rule;
