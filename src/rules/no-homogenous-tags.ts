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

    // One error per tag rather than one summary listing them all, so that
    // each finding points at a single thing to fix, the way every other
    // rule reports.
    for (const child of feature.children) {
      if (child.scenario === undefined) {
        continue;
      }
      const scenario = child.scenario;
      scenarioTags.push(tagNames(scenario.tags));

      // "Every Examples table has this tag" says nothing when there is only
      // one of them, and hoisting the tag would change what it means as soon
      // as a second table is added.
      if (scenario.examples.length < 2) {
        continue;
      }
      for (const tag of intersection(scenario.examples.map((e) => tagNames(e.tags)))) {
        errors.push({
          message:
            'Every Examples table of this Scenario Outline has the tag ' +
            `${tag}, it should be defined on the Scenario Outline instead`,
          rule: name,
          line: scenario.location.line,
        });
      }
    }

    // Likewise, a single scenario's tags are not shared with anything. Tags
    // that identify one scenario - a ticket reference, say - belong on the
    // scenario, and moving them to the Feature would be wrong advice.
    if (scenarioTags.length < 2) {
      return errors;
    }

    for (const tag of intersection(scenarioTags)) {
      errors.push({
        message:
          `Every Scenario on this Feature has the tag ${tag}, ` +
          'it should be defined on the Feature instead',
        rule: name,
        line: feature.location.line,
      });
    }

    return errors;
  },
};

export default rule;
