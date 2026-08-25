import {test} from 'node:test';
import rule from '../../../src/rules/no-partially-commented-tag-lines.ts';
import {checkRule} from '../../helpers.ts';

const message = 'Partially commented tag lines not allowed';

test('accepts tag lines with no inline comment', async () => {
  await checkRule(rule, 'no-partially-commented-tag-lines/NoViolations.feature', {}, []);
});

test('reports a comment started part way along a tag line', async () => {
  await checkRule(rule, 'no-partially-commented-tag-lines/Violations.feature', {}, [
    {message, line: 1},
    {message, line: 7},
    {message, line: 12},
    {message, line: 15},
  ]);
});
