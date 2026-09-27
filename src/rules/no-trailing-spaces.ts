import type {LintRule, RuleError} from '../types.ts';
import {atLineColumn, columnOf} from '../util/location.ts';

const name = 'no-trailing-spaces';
const TRAILING_WHITESPACE = /[\t ]+$/;

const rule: LintRule = {
  name,
  run(_feature, file) {
    const errors: RuleError[] = [];
    file.lines.forEach((line, index) => {
      const trailing = TRAILING_WHITESPACE.exec(line);
      if (trailing !== null) {
        errors.push({
          message: 'Trailing spaces are not allowed',
          rule: name,
          // Point at the first character of the run, so an editor can
          // underline exactly what has to go.
          ...atLineColumn(index + 1, columnOf(line, trailing.index)),
        });
      }
    });
    return errors;
  },
};

export default rule;
