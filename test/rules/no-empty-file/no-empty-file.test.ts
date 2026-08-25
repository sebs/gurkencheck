import {test} from 'node:test';
import rule from '../../../src/rules/no-empty-file.ts';
import {checkRule} from '../../helpers.ts';

const message = 'Empty feature files are disallowed';

test('accepts a file with a feature in it', () => {
  checkRule(rule, 'no-empty-file/NoViolations.feature', {}, []);
});

test('reports an empty file', () => {
  checkRule(rule, 'no-empty-file/EmptyFeature.feature', {}, [{message, line: 1}]);
});

test('reports a file containing only whitespace', () => {
  checkRule(rule, 'no-empty-file/OnlyWhitespace.feature', {}, [{message, line: 1}]);
});
