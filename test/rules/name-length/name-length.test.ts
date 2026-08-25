import {test} from 'node:test';
import rule from '../../../src/rules/name-length.ts';
import {checkRule} from '../../helpers.ts';

const tooLong = (element: string, length: number, line: number) => ({
  message: `${element} name is too long. Length of ${length} is longer than the maximum allowed: 70`,
  line,
});

test('accepts names within the default limit', () => {
  checkRule(rule, 'name-length/CorrectLength.feature', {}, []);
});

test('reports long feature, scenario and step names', () => {
  checkRule(rule, 'name-length/WrongLength.feature', {}, [
    tooLong('Feature', 89, 1),
    tooLong('Step', 94, 4),
    tooLong('Scenario', 90, 6),
    tooLong('Step', 101, 7),
    tooLong('Scenario', 98, 9),
    tooLong('Step', 108, 10),
  ]);
});
