import {getNeutralKeyword} from '../gherkin/keywords.ts';
import {scenariosOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';
import {mergeDefaults} from '../util/collections.ts';
import {at} from '../util/location.ts';

const name = 'only-one-when';

const availableConfigs = {
  /**
   * Whether an `And` following a `When` counts as another `When`.
   *
   * On, because the rule is really about one action per scenario, and
   * `When I log in / And I log out` is two actions. Turn it off if your team
   * writes a single action across several And steps.
   */
  countAnd: true,
};

const rule: LintRule = {
  name,
  availableConfigs,
  run(feature, _file, configuration) {
    if (feature === undefined) {
      return [];
    }

    const {countAnd} = mergeDefaults(availableConfigs, configuration);
    const errors: RuleError[] = [];

    for (const {scenario} of scenariosOf(feature)) {
      let lastRealKeyword = '';
      let whenCount = 0;
      let firstViolation: {line: number; column?: number} = {line: 0};

      for (const step of scenario.steps) {
        const keyword = getNeutralKeyword(step, feature.language);
        // An `And` carries on from whichever keyword came before it, however
        // many of them are chained together.
        const continuesWhen = keyword === 'and' && lastRealKeyword === 'when';

        if (keyword !== 'when' && !continuesWhen) {
          lastRealKeyword = keyword;
          continue;
        }

        lastRealKeyword = 'when';
        if (keyword === 'and' && !countAnd) {
          continue;
        }

        whenCount++;
        if (whenCount > 1 && firstViolation.line === 0) {
          firstViolation = at(step.location);
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
