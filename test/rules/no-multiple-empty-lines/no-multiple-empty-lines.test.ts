import {test} from 'node:test';
import rule from '../../../src/rules/no-multiple-empty-lines.ts';
import {checkRule} from '../../helpers.ts';

const message = 'Multiple empty lines are not allowed';

test('accepts single blank lines', () => {
  checkRule(rule, 'no-multiple-empty-lines/NoViolations.feature', {}, []);
});

test('reports each consecutive blank line', () => {
  // The fixture is 24 lines long. The single blank line at the end of it is
  // not a violation, and line 25 does not exist. See issue 226.
  checkRule(
    rule,
    'no-multiple-empty-lines/Violations.feature',
    {},
    [2, 6, 7, 8, 12, 17].map((line) => ({message, line})),
  );
});

// https://github.com/gherkin-lint/gherkin-lint/issues/226
test('never reports a line past the end of the file', () => {
  checkRule(rule, 'no-multiple-empty-lines/SingleTrailingNewLine.feature', {}, []);
});

test('reports a genuine blank line at the end of the file, on a line that exists', () => {
  checkRule(rule, 'no-multiple-empty-lines/TrailingEmptyLines.feature', {}, [{message, line: 7}]);
});
