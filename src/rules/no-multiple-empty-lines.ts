import type {LintRule, RuleError} from '../types.ts';
import {contentLines, markDocStrings} from '../util/lines.ts';

const name = 'no-multiple-empty-lines';

const rule: LintRule = {
  name,
  run(_feature, file) {
    const errors: RuleError[] = [];
    const lines = contentLines(file);
    const inDocString = markDocStrings(lines);

    for (let index = 0; index < lines.length - 1; index++) {
      // Blank lines inside a doc string are part of the text being quoted.
      if (inDocString[index] === true || inDocString[index + 1] === true) {
        continue;
      }
      if (lines[index]!.trim() === '' && lines[index + 1]!.trim() === '') {
        errors.push({
          message: 'Multiple empty lines are not allowed',
          rule: name,
          line: index + 2,
        });
      }
    }
    return errors;
  },
};

export default rule;
