import {scenariosOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';
import {at} from '../util/location.ts';

const name = 'no-unnamed-scenarios';

const rule: LintRule = {
  name,
  run(feature) {
    if (feature === undefined) {
      return [];
    }
    const errors: RuleError[] = [];
    for (const {scenario} of scenariosOf(feature)) {
      if (scenario.name === '') {
        errors.push({
          message: 'Missing Scenario name',
          rule: name,
          ...at(scenario.location),
        });
      }
    }
    return errors;
  },
};

export default rule;
