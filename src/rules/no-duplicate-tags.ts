import type {Tag} from '@cucumber/messages';
import type {LintRule, RuleError} from '../types.ts';
import {at} from '../util/location.ts';

const name = 'no-duplicate-tags';

/**
 * Reports every repeat of a tag, not just the first. Three copies of a tag
 * are two mistakes, and being told about one at a time means running the
 * linter again after each fix.
 */
function checkTags(tags: readonly Tag[], errors: RuleError[]): void {
  const seen = new Set<string>();

  for (const tag of tags) {
    if (seen.has(tag.name)) {
      errors.push({
        message: `Duplicate tags are not allowed: ${tag.name}`,
        rule: name,
        ...at(tag.location),
      });
    } else {
      seen.add(tag.name);
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
