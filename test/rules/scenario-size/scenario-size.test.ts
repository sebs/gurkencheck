import {test} from 'node:test';
import rule from '../../../src/rules/scenario-size.ts';
import {checkRule} from '../../helpers.ts';

const tooLong = (type: string, actual: number, expected: number, line: number) => ({
  message: `Element ${type} too long: actual ${actual}, expected ${expected}`,
  line,
});

test('accepts blocks within the default limit', () => {
  checkRule(rule, 'scenario-size/ExampleFeature.feature', undefined, []);
});

test('reports blocks over the configured limit', () => {
  checkRule(
    rule,
    'scenario-size/ExampleFeature.feature',
    {'steps-length': {Background: 2, Scenario: 3}},
    [
      tooLong('Background', 5, 2, 3),
      tooLong('Scenario', 5, 3, 10),
      tooLong('Scenario Outline', 5, 3, 17),
    ],
  );
});
