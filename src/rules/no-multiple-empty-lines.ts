import type {LintRule, RuleError} from '../types.ts';
import {mergeDefaults} from '../util/collections.ts';
import {contentLines, markDocStrings} from '../util/lines.ts';

const name = 'no-multiple-empty-lines';

const availableConfigs = {
  /** How many blank lines may sit next to each other. */
  max: 1,
};

function messageFor(max: number): string {
  return max === 1
    ? 'Multiple empty lines are not allowed'
    : `More than ${max} empty lines in a row are not allowed`;
}

const rule: LintRule = {
  name,
  availableConfigs,
  run(_feature, file, configuration) {
    const {max} = mergeDefaults(availableConfigs, configuration);
    const lines = contentLines(file);
    const inDocString = markDocStrings(lines);
    const message = messageFor(max);

    const errors: RuleError[] = [];
    let blanksInARow = 0;

    lines.forEach((line, index) => {
      // Blank lines inside a doc string are part of the text being quoted,
      // and they do not join up runs of blank lines on either side of it.
      if (inDocString[index] === true) {
        blanksInARow = 0;
        return;
      }
      if (line.trim() !== '') {
        blanksInARow = 0;
        return;
      }

      blanksInARow++;
      // One error per blank line past the limit, pointing at that line.
      if (blanksInARow > max) {
        errors.push({message, rule: name, line: index + 1});
      }
    });

    return errors;
  },
};

export default rule;
