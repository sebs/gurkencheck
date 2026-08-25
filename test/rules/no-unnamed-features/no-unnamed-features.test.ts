import {test} from 'node:test';
import rule from '../../../src/rules/no-unnamed-features.ts';
import {checkRule} from '../../helpers.ts';

const message = 'Missing Feature name';

test('accepts a named feature', () => {
  checkRule(rule, 'no-unnamed-features/NoViolations.feature', {}, []);
});

test('reports an empty file', () => {
  checkRule(rule, 'no-unnamed-features/EmptyFeature.feature', {}, [{message, line: 0}]);
});

test('reports a feature with no name', () => {
  checkRule(rule, 'no-unnamed-features/UnnamedFeature.feature', {}, [{message, line: 3}]);
});
