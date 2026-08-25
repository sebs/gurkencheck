import type {LintRule, RuleError} from '../types.ts';

const name = 'no-trailing-spaces';
const TRAILING_WHITESPACE = /[\t ]+$/;

const rule: LintRule = {
  name,
  run(_feature, file) {
    const errors: RuleError[] = [];
    file.lines.forEach((line, index) => {
      if (TRAILING_WHITESPACE.test(line)) {
        errors.push({message: 'Trailing spaces are not allowed', rule: name, line: index + 1});
      }
    });
    return errors;
  },
};

export default rule;
