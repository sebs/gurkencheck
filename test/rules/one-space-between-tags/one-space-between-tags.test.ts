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

test('measures a tag in characters, as Gherkin counts its columns', async () => {
  await checkRule(rule, 'one-space-between-tags/EmojiTags.feature', {}, [
    {message: 'There is more than one space between the tags @🚀🚀 and @b', line: 1},
  ]);
});

test('reports a tab, or no space at all, between tags', async () => {
  await checkRule(rule, 'one-space-between-tags/OtherSeparators.feature', {}, [
    {message: 'The tags @a and @b should be separated by one space, not "\\t"', line: 3},
    {message: 'There is no space between the tags @c and @d', line: 3},
    tooWide('@e', '@f', 3),
  ]);
});

test('shows a non-breaking space between tags as an escape, not as itself', async () => {
  await checkRule(rule, 'one-space-between-tags/NonBreakingSpace.feature', {}, [
    {message: 'The tags @a and @b should be separated by one space, not "\\u00a0"', line: 3},
  ]);
});
