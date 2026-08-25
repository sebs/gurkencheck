import type {LintRule, RuleError} from '../types.ts';
import {at} from '../util/location.ts';

const name = 'no-empty-background';

const rule: LintRule = {
  name,
  run(feature) {
    const errors: RuleError[] = [];
    for (const child of feature?.children ?? []) {
      if (child.background !== undefined && child.background.steps.length === 0) {
        errors.push({
          message: 'Empty backgrounds are not allowed.',
          rule: name,
          ...at(child.background.location),
        });
      }
    }
    return errors;
  },
};

export default rule;
