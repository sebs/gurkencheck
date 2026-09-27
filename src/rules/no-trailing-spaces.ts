import type {LintRule, RuleError} from '../types.ts';
import {markDocStrings} from '../util/lines.ts';
import {atLineColumn, columnOf} from '../util/location.ts';

const name = 'no-trailing-spaces';
const TRAILING_WHITESPACE = /[\t ]+$/;

const rule: LintRule = {
  name,
  run(feature, file) {
    const errors: RuleError[] = [];
    const inDocString = markDocStrings(file.lines, feature);
    file.lines.forEach((line, index) => {
      // The content of a doc string is data - expected output, a request
      // body - where trailing spaces may be the point. Its delimiters are
      // layout like any other line.
      const trimmed = line.trim();
      const isDelimiter = trimmed.startsWith('"""') || trimmed.startsWith('```');
      if (inDocString[index] === true && !isDelimiter) {
        return;
      }
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
