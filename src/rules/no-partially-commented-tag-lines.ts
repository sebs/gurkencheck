import type {Tag} from '@cucumber/messages';
import type {LintRule, RuleError} from '../types.ts';

const name = 'no-partially-commented-tag-lines';

/**
 * A `#` on a tag line comments out everything after it. That is easy to do by
 * accident and silently disables tags, so it is worth flagging.
 *
 * The check reads the original source line rather than the parsed tags,
 * because by the time the file is parsed the commented-out part is gone.
 * Only lines the parser identified as tag lines are looked at, so a `#`
 * inside a doc string is not mistaken for one.
 */
function collectTagLines(tags: readonly Tag[], into: Set<number>): void {
  for (const tag of tags) {
    into.add(tag.location.line);
  }
}

const rule: LintRule = {
  name,
  run(feature, file) {
    if (feature === undefined) {
      return [];
    }

    const tagLines = new Set<number>();
    collectTagLines(feature.tags, tagLines);

    for (const child of feature.children) {
      if (child.scenario === undefined) {
        continue;
      }
      collectTagLines(child.scenario.tags, tagLines);
      for (const examples of child.scenario.examples) {
        collectTagLines(examples.tags, tagLines);
      }
    }

    const errors: RuleError[] = [];
    for (const line of [...tagLines].sort((a, b) => a - b)) {
      if (file.lines[line - 1]?.includes('#') === true) {
        errors.push({message: 'Partially commented tag lines not allowed', rule: name, line});
      }
    }
    return errors;
  },
};

export default rule;
