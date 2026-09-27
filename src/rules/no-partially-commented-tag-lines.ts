import type {Tag} from '@cucumber/messages';
import {taggedNodesOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';
import {atLineColumn} from '../util/location.ts';

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
    for (const {node} of taggedNodesOf(feature)) {
      collectTagLines(node.tags, tagLines);
    }

    const errors: RuleError[] = [];
    for (const line of [...tagLines].sort((a, b) => a - b)) {
      // As in Gherkin itself, only a # after whitespace starts a comment;
      // one inside a tag, as in @issue#123, is part of the tag.
      const comment = /\s#/u.exec(file.lines[line - 1] ?? '');
      if (comment !== null) {
        errors.push({
          message: 'Partially commented tag lines not allowed',
          rule: name,
          // Point at the '#' itself: that is the character to remove.
          ...atLineColumn(line, comment.index + 2),
        });
      }
    }
    return errors;
  },
};

export default rule;
