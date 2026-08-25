/**
 * Columns, kept together so that every other rule test stays about the thing
 * the rule is checking.
 *
 * https://github.com/gherkin-lint/gherkin-lint/issues/211
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import indentation from '../../src/rules/indentation.ts';
import noDuplicateTags from '../../src/rules/no-duplicate-tags.ts';
import noPartiallyCommentedTagLines from '../../src/rules/no-partially-commented-tag-lines.ts';
import noTrailingSpaces from '../../src/rules/no-trailing-spaces.ts';
import noUnnamedScenarios from '../../src/rules/no-unnamed-scenarios.ts';
import noEmptyFile from '../../src/rules/no-empty-file.ts';
import newLineAtEof from '../../src/rules/new-line-at-eof.ts';
import useAnd from '../../src/rules/use-and.ts';
import type {LintRule} from '../../src/types.ts';
import {runRule} from '../helpers.ts';

async function positions(
  rule: LintRule,
  fixture: string,
  configuration?: unknown,
): Promise<{line: number; column: number | undefined}[]> {
  const errors = await runRule(rule, fixture, configuration);
  return errors.map((error) => ({line: error.line, column: error.column}));
}

test('indentation points at the column the line actually starts in', async () => {
  const found = await positions(indentation, 'indentation/WrongIndentationSpaces.feature', {});
  assert.deepEqual(
    found.filter((p) => p.line === 4 || p.line === 5),
    [
      {line: 4, column: 5}, // Background indented four spaces
      {line: 5, column: 1}, // step not indented at all
    ],
  );
});

test('a tag error points at the tag', async () => {
  assert.deepEqual(await positions(noDuplicateTags, 'no-duplicate-tags/RepeatedThreeTimes.feature'), [
    // @bar @foo @bar @bar - the repeats start at columns 11 and 16
    {line: 3, column: 11},
    {line: 3, column: 16},
  ]);
});

test('a step error points at the step keyword', async () => {
  const found = await positions(useAnd, 'use-and/Violations.feature');
  assert.deepEqual(found[0], {line: 5, column: 3});
});

test('a scenario error points at the scenario keyword', async () => {
  assert.deepEqual(await positions(noUnnamedScenarios, 'no-unnamed-scenarios/Violations.feature'), [
    {line: 3, column: 1},
    {line: 6, column: 1},
  ]);
});

test('trailing whitespace points at the first character that has to go', async () => {
  assert.deepEqual(await positions(noTrailingSpaces, 'no-trailing-spaces/TrailingSpaces.feature'), [
    {line: 1, column: 34},
    {line: 3, column: 50},
    {line: 4, column: 47},
  ]);
});

test('a partially commented tag line points at the hash', async () => {
  assert.deepEqual(
    await positions(
      noPartiallyCommentedTagLines,
      'no-partially-commented-tag-lines/Violations.feature',
    ),
    [
      {line: 1, column: 6},
      {line: 7, column: 6},
      {line: 12, column: 6},
      {line: 15, column: 7},
    ],
  );
});

test('errors about a whole file carry no column', async () => {
  assert.deepEqual(await positions(noEmptyFile, 'no-empty-file/EmptyFeature.feature'), [
    {line: 1, column: undefined},
  ]);
  assert.deepEqual(await positions(newLineAtEof, 'new-line-at-eof/NoNewLineAtEOF.feature', 'yes'), [
    {line: 5, column: undefined},
  ]);
});
