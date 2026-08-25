import {test} from 'node:test';
import rule from '../../../src/rules/no-trailing-spaces.ts';
import {checkRule} from '../../helpers.ts';

const message = 'Trailing spaces are not allowed';

test('accepts lines with no trailing whitespace', async () => {
  await checkRule(rule, 'no-trailing-spaces/NoViolations.feature', {}, []);
});

test('reports trailing spaces', async () => {
  await checkRule(
    rule,
    'no-trailing-spaces/TrailingSpaces.feature',
    {},
    [1, 3, 4].map((line) => ({message, line})),
  );
});

test('reports trailing tabs', async () => {
  await checkRule(rule, 'no-trailing-spaces/TrailingTabs.feature', {}, [{message, line: 4}]);
});
