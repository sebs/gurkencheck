import {getNeutralKeyword} from '../gherkin/keywords.ts';
import {stepContainersOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';
import {at} from '../util/location.ts';

const name = 'use-and';

const rule: LintRule = {
  name,
  run(feature) {
    if (feature === undefined) {
      return [];
    }

    const errors: RuleError[] = [];

    for (const {node} of stepContainersOf(feature)) {
      let previousKeyword: string | undefined;

      for (const step of node.steps) {
        const keyword = getNeutralKeyword(step, feature.language);
        if (keyword === 'and') {
          continue;
        }
        if (keyword === previousKeyword) {
          errors.push({
            message: `Step "${step.keyword}${step.text}" should use And instead of ${step.keyword}`,
            rule: name,
            ...at(step.location),
          });
        }
        previousKeyword = keyword;
      }
    }

    return errors;
  },
};

export default rule;
