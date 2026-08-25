import {getNeutralKeyword} from '../gherkin/keywords.ts';
import {scenariosOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';

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
      let firstViolationLine = 0;

      for (const step of scenario.steps) {
        const keyword = getNeutralKeyword(step, feature.language);
        // An `And` continues whichever keyword came before it.
        if (keyword === 'when' || (keyword === 'and' && lastRealKeyword === 'when')) {
          lastRealKeyword = 'when';
          whenCount++;
          if (whenCount > 1 && firstViolationLine === 0) {
            firstViolationLine = step.location.line;
          }
        } else {
          lastRealKeyword = keyword;
        }
      }

      if (whenCount > 1) {
        errors.push({
          message: `Scenario "${scenario.name}" contains ${whenCount} When statements (max 1)`,
          rule: name,
          line: firstViolationLine,
        });
      }
    }

    return errors;
  },
};

export default rule;
