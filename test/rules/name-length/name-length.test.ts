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

// https://github.com/gherkin-lint/gherkin-lint/issues/269
test('a limit of 0 turns the check off for that kind of name', () => {
  checkRule(rule, 'name-length/WrongLength.feature', {Step: 0}, [
    tooLong('Feature', 89, 1),
    tooLong('Scenario', 90, 6),
    tooLong('Scenario', 98, 9),
  ]);
});

test('every limit can be turned off at once', () => {
  checkRule(rule, 'name-length/WrongLength.feature', {Feature: 0, Rule: 0, Scenario: 0, Step: 0}, []);
});

test('other limits keep working when one is turned off', () => {
  checkRule(rule, 'name-length/WrongLength.feature', {Feature: 0, Scenario: 0}, [
    {
      message: 'Step name is too long. Length of 94 is longer than the maximum allowed: 70',
      line: 4,
    },
    {
      message: 'Step name is too long. Length of 101 is longer than the maximum allowed: 70',
      line: 7,
    },
    {
      message: 'Step name is too long. Length of 108 is longer than the maximum allowed: 70',
      line: 10,
    },
  ]);
});
