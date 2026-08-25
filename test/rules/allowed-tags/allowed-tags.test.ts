import {test} from 'node:test';
import rule from '../../../src/rules/allowed-tags.ts';
import {checkRule} from '../../helpers.ts';

const config = {tags: ['@featuretag', '@scenariotag'], patterns: ['^@examplestag$']};
const notAllowed = (tag: string, nodeType: string, line: number) => ({
  message: `Not allowed tag ${tag} on ${nodeType}`,
  line,
});

test('allows tags on the list and tags matching a pattern', async () => {
  await checkRule(rule, 'allowed-tags/NoViolations.feature', config, []);
});

test('reports tags on features, scenarios, outlines and examples', async () => {
  await checkRule(rule, 'allowed-tags/Violations.feature', config, [
    notAllowed('@featuretag1', 'Feature', 1),
    notAllowed('@anothertag', 'Feature', 1),
    notAllowed('@scenariotag1', 'Scenario', 7),
    notAllowed('@scenariotag2', 'Scenario', 7),
    notAllowed('@anothertag', 'Scenario', 7),
    notAllowed('@scenariotag1', 'Scenario Outline', 11),
    notAllowed('@examplestag1', 'Examples', 14),
  ]);
});
