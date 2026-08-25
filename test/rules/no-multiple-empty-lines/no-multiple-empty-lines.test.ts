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

// https://github.com/gherkin-lint/gherkin-lint/issues/143
test('ignores blank lines inside a doc string', () => {
  checkRule(rule, 'no-multiple-empty-lines/DocString.feature', {}, []);
});

test('still reports blank lines after a doc string has closed', () => {
  checkRule(rule, 'no-multiple-empty-lines/DocStringAndRealViolation.feature', {}, [
    {message, line: 12},
  ]);
});

// https://github.com/gherkin-lint/gherkin-lint/issues/285
test('max defaults to one blank line', () => {
  checkRule(rule, 'no-multiple-empty-lines/ThreeInARow.feature', {}, [
    {message, line: 6},
    {message, line: 7},
  ]);
});

test('max lets two blank lines through and still catches the third', () => {
  checkRule(rule, 'no-multiple-empty-lines/ThreeInARow.feature', {max: 2}, [
    {message: 'More than 2 empty lines in a row are not allowed', line: 7},
  ]);
});

test('a generous max accepts the file outright', () => {
  checkRule(rule, 'no-multiple-empty-lines/ThreeInARow.feature', {max: 3}, []);
});

test('a doc string breaks a run of blank lines rather than joining it up', () => {
  checkRule(rule, 'no-multiple-empty-lines/DocString.feature', {max: 1}, []);
});
