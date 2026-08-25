import {getNodeType} from '../gherkin/keywords.ts';
import {scenariosOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';
import {at} from '../util/location.ts';

const name = 'no-examples-in-scenarios';

const rule: LintRule = {
  name,
  run(feature) {
    if (feature === undefined) {
      return [];
    }

    const errors: RuleError[] = [];

    for (const {scenario} of scenariosOf(feature)) {
      if (getNodeType(scenario, feature.language) === 'Scenario' && scenario.examples.length > 0) {
        errors.push({
          message: 'Cannot use "Examples" in a "Scenario", use a "Scenario Outline" instead',
          rule: name,
          ...at(scenario.location),
        });
      }
    }

    return errors;
  },
};

export default rule;
