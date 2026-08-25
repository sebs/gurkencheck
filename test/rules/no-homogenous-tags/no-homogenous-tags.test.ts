import {test} from 'node:test';
import rule from '../../../src/rules/no-homogenous-tags.ts';
import {checkRule} from '../../helpers.ts';

test('accepts tags that differ between scenarios', () => {
  checkRule(rule, 'no-homogenous-tags/NoViolations.feature', {}, []);
});

test('reports tags shared by every scenario and by every examples table', () => {
  checkRule(rule, 'no-homogenous-tags/Violations.feature', {}, [
    {
      message:
        'All Scenarios on this Feature have the same tag(s), they should be defined ' +
        'on the Feature instead: @tag1, @tag2',
      line: 1,
    },
    {
      message:
        'All Examples of a Scenario Outline have the same tag(s), they should be defined ' +
        'on the Scenario Outline instead: @tag5',
      line: 11,
    },
  ]);
});
