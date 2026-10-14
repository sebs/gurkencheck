import {test} from 'node:test';
import rule from '../../../src/rules/no-unnamed-features.ts';
import {checkRule} from '../../helpers.ts';

const message = 'Missing Feature name';

test('accepts a named feature', async () => {
  await checkRule(rule, 'no-unnamed-features/NoViolations.feature', {}, []);
});

test('leaves a file with no Feature to no-empty-file', async () => {
  await checkRule(rule, 'no-unnamed-features/EmptyFeature.feature', {}, []);
});

test('reports a feature with no name', async () => {
  await checkRule(rule, 'no-unnamed-features/UnnamedFeature.feature', {}, [{message, line: 3}]);
});
