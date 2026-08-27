import {resolvedStepKeywords} from '../gherkin/keywords.ts';
import {backgroundsOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';
import {at} from '../util/location.ts';

const name = 'background-setup-only';

const rule: LintRule = {
  name,
  run(feature) {
    if (feature === undefined) {
      return [];
    }

    const errors: RuleError[] = [];

    for (const {background} of backgroundsOf(feature)) {
      const keywords = resolvedStepKeywords(background.steps, feature.language);

      // One error per step rather than one for the Background, because each
      // step is a separate decision: move it into the scenarios, or drop it.
      background.steps.forEach((step, index) => {
        const keyword = keywords[index];
        if (keyword !== 'when' && keyword !== 'then') {
          return;
        }

        errors.push({
          message: `Step "${step.keyword}${step.text}" is not a setup step, and a Background only sets things up`,
          rule: name,
          ...at(step.location),
        });
      });
    }

    return errors;
  },
};

export default rule;
