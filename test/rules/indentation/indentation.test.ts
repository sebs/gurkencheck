import {test} from 'node:test';
import rule from '../../../src/rules/indentation.ts';
import {checkRule, type ExpectedError} from '../../helpers.ts';

const wrong = (element: string, expected: number, actual: number, line: number): ExpectedError => ({
  message: `Wrong indentation for "${element}", expected indentation level of ${expected}, but got ${actual}`,
  line,
});

const englishViolations: ExpectedError[] = [
  wrong('Feature', 0, 1, 2),
  wrong('feature tag', 0, 1, 1),
  wrong('Background', 0, 4, 4),
  wrong('Step', 2, 0, 5),
  wrong('Scenario', 0, 1, 9),
  wrong('scenario tag', 0, 1, 7),
  wrong('scenario tag', 0, 1, 8),
  wrong('Step', 2, 3, 10),
  wrong('Scenario', 0, 3, 14),
  wrong('Examples', 0, 2, 16),
  wrong('example', 2, 4, 17),
  wrong('example', 2, 4, 18),
  wrong('scenario tag', 0, 3, 12),
  wrong('scenario tag', 0, 4, 13),
  wrong('Step', 2, 3, 15),
];

test('accepts correctly indented files using spaces', async () => {
  await checkRule(rule, 'indentation/CorrectIndentationSpaces.feature', {}, []);
});

test('accepts correctly indented files using tabs', async () => {
  await checkRule(rule, 'indentation/CorrectIndentationTabs.feature', {}, []);
});

test('reports wrong indentation with spaces', async () => {
  await checkRule(rule, 'indentation/WrongIndentationSpaces.feature', {}, englishViolations);
});

test('reports wrong indentation with tabs', async () => {
  await checkRule(rule, 'indentation/WrongIndentationTabs.feature', {}, englishViolations);
});

test('reports wrong indentation in other languages', async () => {
  await checkRule(rule, 'indentation/WrongIndentationDifferentLanguage.feature', {}, [
    wrong('Feature', 0, 4, 3),
    wrong('feature tag', 0, 4, 2),
    wrong('Background', 0, 4, 5),
    wrong('Step', 2, 0, 6),
    wrong('Scenario', 0, 4, 10),
    wrong('scenario tag', 0, 4, 8),
    wrong('scenario tag', 0, 1, 9),
    wrong('Step', 2, 12, 11),
    wrong('Scenario', 0, 12, 15),
    wrong('Examples', 0, 7, 17),
    wrong('example', 2, 15, 18),
    wrong('example', 2, 15, 19),
    wrong('scenario tag', 0, 4, 13),
    wrong('scenario tag', 0, 1, 14),
    wrong('Step', 2, 11, 16),
  ]);
});

test('tag indentation follows the node it belongs to when not set', async () => {
  await checkRule(
    rule,
    'indentation/CorrectIndentationWithFeatureAndScenarioOverrides.feature',
    {Feature: 1, Scenario: 3},
    [],
  );
});

test('tag indentation can be set on its own', async () => {
  await checkRule(
    rule,
    'indentation/CorrectIndentationWithScenarioTagOverrides.feature',
    {'scenario tag': 3},
    [],
  );
});

// https://github.com/gherkin-lint/gherkin-lint/issues/140
test('a doc string follows the Step setting, one level further in', async () => {
  await checkRule(rule, 'indentation/DocStrings.feature', {Scenario: 2, Step: 4}, [
    wrong('docstring', 6, 4, 12),
    wrong('docstring', 6, 4, 19),
  ]);
});

test('docstring indentation can be set on its own', async () => {
  await checkRule(rule, 'indentation/DocStrings.feature', {Scenario: 2, Step: 4, docstring: 4}, [
    wrong('docstring', 4, 6, 5),
  ]);
});

// https://github.com/gherkin-lint/gherkin-lint/issues/331
const wrongCharacter = (element: string, expected: string, line: number): ExpectedError => ({
  message: `Wrong indentation character for "${element}", expected ${expected}s`,
  line,
});

test('character defaults to accepting either', async () => {
  await checkRule(rule, 'indentation/CorrectIndentationTabs.feature', {}, []);
  await checkRule(rule, 'indentation/CorrectIndentationSpaces.feature', {}, []);
});

test('character "space" reports lines indented with tabs', async () => {
  await checkRule(rule, 'indentation/CorrectIndentationTabs.feature', {character: 'space'}, [
    wrongCharacter('Step', 'space', 5),
    wrongCharacter('Step', 'space', 10),
    wrongCharacter('Step', 'space', 15),
    wrongCharacter('example', 'space', 17),
    wrongCharacter('example', 'space', 18),
    wrongCharacter('example', 'space', 19),
  ]);
});

test('character "tab" reports lines indented with spaces', async () => {
  await checkRule(rule, 'indentation/CorrectIndentationSpaces.feature', {character: 'tab'}, [
    wrongCharacter('Step', 'tab', 5),
    wrongCharacter('Step', 'tab', 10),
    wrongCharacter('Step', 'tab', 15),
    wrongCharacter('example', 'tab', 17),
    wrongCharacter('example', 'tab', 18),
    wrongCharacter('example', 'tab', 19),
  ]);
});

test('an unrecognised character setting checks nothing', async () => {
  await checkRule(rule, 'indentation/CorrectIndentationTabs.feature', {character: 'wibble'}, []);
});
