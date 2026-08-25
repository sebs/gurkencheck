import {test} from 'node:test';
import rule from '../../../src/rules/no-multiple-empty-lines.ts';
import {checkRule} from '../../helpers.ts';

const message = 'Multiple empty lines are not allowed';

test('accepts single blank lines', () => {
  checkRule(rule, 'no-multiple-empty-lines/NoViolations.feature', {}, []);
});

test('reports each consecutive blank line', () => {
  checkRule(
    rule,
    'no-multiple-empty-lines/Violations.feature',
    {},
    [2, 6, 7, 8, 12, 17, 25].map((line) => ({message, line})),
  );
});
