import {test} from 'node:test';
import rule from '../../../src/rules/new-line-at-eof.ts';
import {checkRule} from '../../helpers.ts';

const required = 'New line at EOF(end of file) is required';
const notAllowed = 'New line at EOF(end of file) is not allowed';

test('accepts a trailing new line when configured to "yes"', async () => {
  await checkRule(rule, 'new-line-at-eof/NewLineAtEOF.feature', 'yes', []);
});

test('accepts no trailing new line when configured to "no"', async () => {
  await checkRule(rule, 'new-line-at-eof/NoNewLineAtEOF.feature', 'no', []);
});

test('reports a missing new line when configured to "yes"', async () => {
  await checkRule(rule, 'new-line-at-eof/NoNewLineAtEOF.feature', 'yes', [{message: required, line: 5}]);
});

test('reports a trailing new line when configured to "no"', async () => {
  await checkRule(rule, 'new-line-at-eof/NewLineAtEOF.feature', 'no', [{message: notAllowed, line: 6}]);
});

test('falls back to requiring a new line when no setting is given', async () => {
  await checkRule(rule, 'new-line-at-eof/NoNewLineAtEOF.feature', undefined, [
    {message: required, line: 5},
  ]);
});
