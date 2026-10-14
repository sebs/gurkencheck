import {test} from 'node:test';
import rule from '../../../src/rules/no-superfluous-tags.ts';
import {checkRule} from '../../helpers.ts';

const duplicated = (child: string, parent: string, tag: string, line: number) => ({
  message: `Tag duplication between ${child} and its corresponding ${parent}: ${tag}`,
  line,
});

test('accepts tags that are not repeated on a parent', async () => {
  await checkRule(rule, 'no-superfluous-tags/NoViolations.feature', {}, []);
});

test('reports tags repeated from a parent node', async () => {
  await checkRule(rule, 'no-superfluous-tags/Violations.feature', {}, [
    duplicated('Scenario', 'Feature', '@superfluoustag1', 7),
    duplicated('Scenario Outline', 'Feature', '@superfluoustag1', 11),
    duplicated('Scenario Outline', 'Feature', '@superfluoustag2', 11),
    duplicated('Examples', 'Scenario Outline', '@superfluoustag2', 14),
    duplicated('Examples', 'Scenario Outline', '@scenariotag3', 14),
  ]);
});

test('reports a tag once, against the nearest node already carrying it', async () => {
  await checkRule(rule, 'no-superfluous-tags/InheritedTwice.feature', {}, [
    duplicated('Scenario Outline', 'Feature', '@ok', 3),
    duplicated('Examples', 'Scenario Outline', '@ok', 6),
  ]);
});
