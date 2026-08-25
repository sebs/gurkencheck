import type {Tag} from '@cucumber/messages';
import type {LintRule, RuleError} from '../types.ts';
import {intersection} from '../util/collections.ts';

const name = 'no-homogenous-tags';

function tagNames(tags: readonly Tag[]): string[] {
  return tags.map((tag) => tag.name);
}

const rule: LintRule = {
  name,
  run(feature) {
    if (feature === undefined) {
      return [];
    }

    const errors: RuleError[] = [];
    const scenarioTags: string[][] = [];

    for (const child of feature.children) {
      if (child.scenario === undefined) {
        continue;
      }
      const scenario = child.scenario;
      scenarioTags.push(tagNames(scenario.tags));

      const sharedByEveryExample = intersection(scenario.examples.map((e) => tagNames(e.tags)));
      if (sharedByEveryExample.length > 0) {
        errors.push({
          message:
            'All Examples of a Scenario Outline have the same tag(s), they should be defined ' +
            `on the Scenario Outline instead: ${sharedByEveryExample.join(', ')}`,
          rule: name,
          line: scenario.location.line,
        });
      }
    }

    const sharedByEveryScenario = intersection(scenarioTags);
    if (sharedByEveryScenario.length > 0) {
      errors.push({
        message:
          'All Scenarios on this Feature have the same tag(s), they should be defined ' +
          `on the Feature instead: ${sharedByEveryScenario.join(', ')}`,
        rule: name,
        line: feature.location.line,
      });
    }

    return errors;
  },
};

export default rule;
