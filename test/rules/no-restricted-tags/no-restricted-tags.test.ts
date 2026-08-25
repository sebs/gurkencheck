import {test} from 'node:test';
import rule from '../../../src/rules/no-restricted-tags.ts';
import {checkRule} from '../../helpers.ts';

const config = {tags: ['@badTag'], patterns: ['^@anotherBadTag$']};
const forbidden = (tag: string, nodeType: string, line: number) => ({
  message: `Forbidden tag ${tag} on ${nodeType}`,
  line,
});

test('allows tags that are neither listed nor matching a pattern', async () => {
  await checkRule(rule, 'no-restricted-tags/NoViolations.feature', config, []);
});

test('reports forbidden tags wherever they appear', async () => {
  await checkRule(rule, 'no-restricted-tags/Violations.feature', config, [
    forbidden('@badTag', 'Feature', 1),
    forbidden('@anotherBadTag', 'Feature', 1),
    forbidden('@badTag', 'Scenario', 7),
    forbidden('@anotherBadTag', 'Scenario', 7),
    forbidden('@badTag', 'Scenario Outline', 11),
    forbidden('@anotherBadTag', 'Scenario Outline', 11),
    forbidden('@badTag', 'Examples', 14),
    forbidden('@anotherBadTag', 'Examples', 14),
    forbidden('@badTag', 'Examples', 19),
    forbidden('@anotherBadTag', 'Examples', 19),
  ]);
});
