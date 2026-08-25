import type {Tag} from '@cucumber/messages';
import type {LintRule, RuleError} from '../types.ts';
import {groupBy, sortBy} from '../util/collections.ts';
import {at} from '../util/location.ts';

const name = 'one-space-between-tags';

function checkTags(tags: readonly Tag[], errors: RuleError[]): void {
  for (const [, tagsOnLine] of groupBy(tags, (tag) => tag.location.line)) {
    const ordered = sortBy(tagsOnLine, (tag) => tag.location.column ?? 0);
    for (let index = 0; index < ordered.length - 1; index++) {
      const current = ordered[index]!;
      const next = ordered[index + 1]!;
      const endOfCurrent = (current.location.column ?? 0) + current.name.length;
      if (endOfCurrent < (next.location.column ?? 0) - 1) {
        errors.push({
          message: `There is more than one space between the tags ${current.name} and ${next.name}`,
          rule: name,
          ...at(current.location),
        });
      }
    }
  }
}

const rule: LintRule = {
  name,
  run(feature) {
    if (feature === undefined) {
      return [];
    }

    const errors: RuleError[] = [];
    checkTags(feature.tags, errors);

    for (const child of feature.children) {
      if (child.scenario === undefined) {
        continue;
      }
      checkTags(child.scenario.tags, errors);
      for (const examples of child.scenario.examples) {
        checkTags(examples.tags, errors);
      }
    }
    return errors;
  },
};

export default rule;
