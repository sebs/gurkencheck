import {test} from 'node:test';
import rule from '../../../src/rules/required-tags.ts';
import {checkRule} from '../../helpers.ts';

const missing = (tag: string, nodeType: string, line: number) => ({
  message: `No tag found matching ${tag} for ${nodeType}`,
  line,
});

test('accepts scenarios carrying a matching tag', () => {
  checkRule(
    rule,
    'required-tags/NoViolations.feature',
    {tags: ['@requiredscenariotag', '@required-scenario-tag', '@required-scenario-tag-\\d+']},
    [],
  );
});

test('reports scenarios and outlines missing a required tag', () => {
  checkRule(
    rule,
    'required-tags/Violations.feature',
    {tags: ['@requiredscenariotag', '@requiredScenarioTag', '@required-scenario-tag-\\d+']},
    [
      missing('@requiredScenarioTag', 'Scenario', 8),
      missing('@requiredScenarioTag', 'Scenario Outline', 13),
      missing('@required-scenario-tag-\\d+', 'Scenario', 8),
      missing('@required-scenario-tag-\\d+', 'Scenario Outline', 13),
    ],
  );
});

test('reports untagged scenarios when ignoreUntagged is off', () => {
  checkRule(
    rule,
    'required-tags/Violations.feature',
    {tags: ['@requiredscenariotag'], ignoreUntagged: false},
    [
      missing('@requiredscenariotag', 'Scenario', 20),
      missing('@requiredscenariotag', 'Scenario Outline', 23),
    ],
  );
});
