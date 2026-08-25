import type {LintRule, RuleError} from '../types.ts';
import {at} from '../util/location.ts';

const name = 'no-unnamed-scenarios';

const rule: LintRule = {
  name,
  run(feature) {
    const errors: RuleError[] = [];
    for (const child of feature?.children ?? []) {
      if (child.scenario !== undefined && child.scenario.name === '') {
        errors.push({
          message: 'Missing Scenario name',
          rule: name,
          ...at(child.scenario.location),
        });
      }
    }
    return errors;
  },
};

export default rule;
