import type {LintRule, RuleError} from '../types.ts';
import {docStringParts} from '../util/lines.ts';
import {atLineColumn, columnOf} from '../util/location.ts';

const name = 'no-trailing-spaces';
/**
 * Whitespace at the end of a line: any kind, as String.prototype.trim and so
 * no-multiple-empty-lines see it - a non-breaking space, an ideographic
 * space - not only tabs and spaces. A line of nothing but a non-breaking
 * space was empty to one rule and clean to the other.
 */
const WHITESPACE = /^[^\S\r\n]$/u;

/**
 * Where the whitespace at the end of a line starts, or -1 when there is none.
 *
 * Found by walking back from the end. A pattern anchored at the end is tried
 * again from every position inside a run of spaces, and fails at the end of
 * each when something follows the run - so a line with a long run of spaces
 * in the middle took time with the square of its length, and a crafted
 * feature file could stall a build.
 */
function trailingStart(line: string): number {
  let start = line.length;
  while (start > 0 && WHITESPACE.test(line[start - 1]!)) {
    start--;
  }
  return start < line.length ? start : -1;
}

const rule: LintRule = {
  name,
  run(feature, file) {
    const errors: RuleError[] = [];
    const parts = docStringParts(file.lines, feature);
    file.lines.forEach((line, index) => {
      // The content of a doc string is data - expected output, a request
      // body - where trailing spaces may be the point. Its delimiters are
      // layout like any other line.
      if (parts[index] === 'content') {
        return;
      }
      const trailing = trailingStart(line);
      if (trailing !== -1) {
        errors.push({
          message: 'Trailing spaces are not allowed',
          rule: name,
          // Point at the first character of the run, so an editor can
          // underline exactly what has to go.
          ...atLineColumn(index + 1, columnOf(line, trailing)),
        });
      }
    });
    return errors;
  },
};

export default rule;
