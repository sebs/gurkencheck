import type {LintRule, RuleError} from '../types.ts';

const name = 'no-multiple-empty-lines';

const rule: LintRule = {
  name,
  run(_feature, file) {
    const errors: RuleError[] = [];
    for (let index = 0; index < file.lines.length - 1; index++) {
      if (file.lines[index]!.trim() === '' && file.lines[index + 1]!.trim() === '') {
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
