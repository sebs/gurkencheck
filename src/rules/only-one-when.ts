import {getNeutralKeyword} from '../gherkin/keywords.ts';
import {scenariosOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';
import {at} from '../util/location.ts';

const name = 'only-one-when';

const rule: LintRule = {
  name,
  run(feature) {
    if (feature === undefined) {
      return [];
    }

    const errors: RuleError[] = [];

    for (const {scenario} of scenariosOf(feature)) {
      let lastRealKeyword = '';
      let whenCount = 0;
      let firstViolation: {line: number; column?: number} = {line: 0};

      for (const step of scenario.steps) {
        const keyword = getNeutralKeyword(step, feature.language);
        // An `And` continues whichever keyword came before it.
        if (keyword === 'when' || (keyword === 'and' && lastRealKeyword === 'when')) {
          lastRealKeyword = 'when';
          whenCount++;
          if (whenCount > 1 && firstViolation.line === 0) {
            firstViolation = at(step.location);
          }
        } else {
          lastRealKeyword = keyword;
        }
      }

      if (whenCount > 1) {
        errors.push({
          message: `Scenario "${scenario.name}" contains ${whenCount} When statements (max 1)`,
          rule: name,
          ...firstViolation,
        });
      }
    }

    return errors;
  },
};

export default rule;
