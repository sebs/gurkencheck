import {test} from 'node:test';
import rule from '../../../src/rules/one-space-between-tags.ts';
import {checkRule} from '../../helpers.ts';

const tooWide = (left: string, right: string, line: number) => ({
  message: `There is more than one space between the tags ${left} and ${right}`,
  line,
});

test('accepts tags separated by a single space', async () => {
  await checkRule(rule, 'one-space-between-tags/NoViolations.feature', {}, []);
});

test('reports extra spacing between tags on one line', async () => {
  await checkRule(rule, 'one-space-between-tags/Violations.feature', {}, [
    tooWide('@featuretag1', '@featuretag2', 1),
    tooWide('@scenariotag3', '@scenariotag4', 9),
    tooWide('@scenariotag4', '@scenariotag5', 9),
    tooWide('@scenariotag5', '@scenariotag6', 13),
    tooWide('@examplestag1', '@examplestag2', 16),
  ]);
});
