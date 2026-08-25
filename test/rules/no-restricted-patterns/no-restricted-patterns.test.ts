import {test} from 'node:test';
import rule from '../../../src/rules/no-restricted-patterns.ts';
import {checkRule} from '../../helpers.ts';

const GLOBAL = ['^a restricted global pattern$', 'a bad description'];

const matched = (
  nodeType: string,
  property: string,
  text: string,
  pattern: string,
  line: number,
) => ({
  message: `${nodeType} ${property}: "${text}" matches restricted pattern "/${pattern}/i"`,
  line,
});

test('accepts text that matches nothing restricted', () => {
  checkRule(
    rule,
    'no-restricted-patterns/NoViolations.feature',
    {Global: ['^.*disallowed.*$']},
    [],
  );
});

test('reports feature names and descriptions', () => {
  checkRule(
    rule,
    'no-restricted-patterns/FeatureViolations.feature',
    {Feature: ['^.*disallowed.*$'], Global: GLOBAL},
    [
      matched('Feature', 'name', 'Feature with disallowed patterns', '^.*disallowed.*$', 1),
      matched('Feature', 'description', 'A restricted global pattern', '^a restricted global pattern$', 1),
      matched('Feature', 'description', 'A bad description', 'a bad description', 1),
    ],
  );
});

test('reports background descriptions and steps', () => {
  checkRule(
    rule,
    'no-restricted-patterns/BackgroundViolations.feature',
    {Background: ['^.*disallowed.*$'], Global: GLOBAL},
    [
      matched('Background', 'description', 'A bad description', 'a bad description', 4),
      matched('Step', 'text', 'disallowed background step', '^.*disallowed.*$', 6),
      matched('Step', 'text', 'a restricted global pattern', '^a restricted global pattern$', 7),
    ],
  );
});

test('reports scenario names, descriptions and steps', () => {
  checkRule(
    rule,
    'no-restricted-patterns/ScenarioViolations.feature',
    {Scenario: ['^.*disallowed.*$'], Global: GLOBAL},
    [
      matched('Scenario', 'description', 'A bad description', 'a bad description', 4),
      matched('Scenario', 'name', 'Disallowed exact and partial matching', '^.*disallowed.*$', 4),
      matched('Step', 'text', 'disallowed scenario step', '^.*disallowed.*$', 6),
      matched('Step', 'text', 'a restricted global pattern', '^a restricted global pattern$', 7),
    ],
  );
});

test('reports scenario outline names, descriptions and steps', () => {
  checkRule(
    rule,
    'no-restricted-patterns/ScenarioOutlineViolations.feature',
    {ScenarioOutline: ['^.*disallowed.*$'], Global: GLOBAL},
    [
      matched('Scenario Outline', 'description', 'A bad description', 'a bad description', 4),
      matched('Scenario Outline', 'name', 'Disallowed exact and partial matching', '^.*disallowed.*$', 4),
      matched('Step', 'text', 'disallowed scenario outline step', '^.*disallowed.*$', 6),
      matched('Step', 'text', 'a restricted global pattern', '^a restricted global pattern$', 7),
    ],
  );
});

test('reports rule names and descriptions', () => {
  checkRule(
    rule,
    'no-restricted-patterns/RuleViolations.feature',
    {Rule: ['^.*disallowed.*$'], Global: GLOBAL},
    [
      matched('Rule', 'name', 'Disallowed rule name', '^.*disallowed.*$', 3),
      matched('Rule', 'description', 'A bad description', 'a bad description', 3),
    ],
  );
});

test('steps inside a rule still use the Scenario patterns', () => {
  checkRule(
    rule,
    'no-restricted-patterns/RuleViolations.feature',
    {Scenario: ['^.*disallowed.*$']},
    [matched('Step', 'text', 'disallowed scenario step', '^.*disallowed.*$', 8)],
  );
});
