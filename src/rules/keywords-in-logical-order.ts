import {getNeutralKeyword} from '../gherkin/keywords.ts';
import {stepContainersOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';
import {at} from '../util/location.ts';

const name = 'keywords-in-logical-order';

/** Given sets the scene, When acts, Then checks - in that order. */
const ORDER = ['given', 'when', 'then'] as const;

const rule: LintRule = {
  name,
  run(feature) {
    if (feature === undefined) {
      return [];
    }

    const errors: RuleError[] = [];

    for (const {node} of stepContainersOf(feature)) {
      let furthest = -1;
      /** The keyword, as written in the file, of the step that set `furthest`. */
      let furthestKeyword = '';

      for (const step of node.steps) {
        const keyword = getNeutralKeyword(step, feature.language);
        const position = ORDER.indexOf(keyword as (typeof ORDER)[number]);
        if (position === -1) {
          // And, But and * carry on from whatever came before them.
          continue;
        }

        if (position < furthest) {
          errors.push({
            message: `Step "${step.keyword}${step.text}" should not appear after step using keyword ${furthestKeyword}`,
            rule: name,
            ...at(step.location),
          });
        }
        if (position > furthest) {
          furthest = position;
          furthestKeyword = step.keyword.trim();
        }
      }
    }

    return errors;
  },
};

export default rule;
