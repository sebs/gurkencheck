import {getDialect} from '../gherkin/dialects.ts';
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
    // The file's own word for And: Und, Et, Y. `*` is listed among them in
    // every dialect, and is not what anyone means by it. Where a dialect has
    // several - French lists Et que and Et qu' before Et - the plain word is
    // the shortest.
    const and =
      getDialect(feature.language)
        .and.map((keyword) => keyword.trim())
        .filter((keyword) => keyword !== '*')
        .reduce<string | undefined>((shortest, keyword) => (shortest === undefined || [...keyword].length < [...shortest].length ? keyword : shortest), undefined) ??
      'And';

    for (const {node} of stepContainersOf(feature)) {
      let previousKeyword: string | undefined;

      for (const step of node.steps) {
        const keyword = getNeutralKeyword(step, feature.language);
        // And and * already carry on from the step before them.
        if (keyword === 'and' || keyword === 'star') {
          continue;
        }
        if (keyword === previousKeyword) {
          errors.push({
            message: `Step "${step.keyword}${step.text}" should use ${and} instead of ${step.keyword.trim()}`,
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
