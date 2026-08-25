import {backgroundsOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';
import {at} from '../util/location.ts';

const name = 'no-empty-background';

const rule: LintRule = {
  name,
  run(feature) {
    if (feature === undefined) {
      return [];
    }
    const errors: RuleError[] = [];
    for (const {background} of backgroundsOf(feature)) {
      if (background.steps.length === 0) {
        errors.push({
          message: 'Empty backgrounds are not allowed.',
          rule: name,
          ...at(background.location),
        });
      }
    }
    return errors;
  },
};

export default rule;
