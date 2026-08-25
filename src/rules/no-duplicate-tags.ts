import type {Tag} from '@cucumber/messages';
import type {LintRule, RuleError} from '../types.ts';

const name = 'no-duplicate-tags';

function checkTags(tags: readonly Tag[], errors: RuleError[]): void {
  const seen = new Set<string>();
  const reported = new Set<string>();

  for (const tag of tags) {
    if (reported.has(tag.name)) {
      continue;
    }
    if (seen.has(tag.name)) {
      errors.push({
        message: `Duplicate tags are not allowed: ${tag.name}`,
        rule: name,
        line: tag.location.line,
      });
      reported.add(tag.name);
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
