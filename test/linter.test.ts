import assert from 'node:assert/strict';
import {test} from 'node:test';
import {lint} from '../src/linter.ts';
import {loadRules} from '../src/rules.ts';
import type {RuleError} from '../src/types.ts';

const rules = await loadRules();

async function errorsFor(fixture: string): Promise<RuleError[]> {
  const results = await lint([`test/linter/${fixture}.feature`], {}, rules);
  assert.equal(results.length, 1);
  return results[0]!.errors;
}

test('reports a second Background in one file', async () => {
  assert.deepEqual(await errorsFor('MultipleBackgrounds'), [
    {
      line: 9,
      message: 'Multiple "Background" definitions in the same file are disallowed',
      rule: 'up-to-one-background-per-file',
    },
  ]);
});

test('reports a tag on a Background', async () => {
  assert.deepEqual(await errorsFor('TagOnBackground'), [
    {line: 4, message: 'Tags on Backgrounds are disallowed', rule: 'no-tags-on-backgrounds'},
  ]);
});

test('reports a second Feature in one file', async () => {
  assert.deepEqual(await errorsFor('MultipleFeatures'), [
    {
      line: 7,
      message: 'Multiple "Feature" definitions in the same file are disallowed',
      rule: 'one-feature-per-file',
    },
  ]);
});

const multilineStep = {
  message:
    'Steps should begin with "Given", "When", "Then", "And" or "But". Multiline steps are disallowed',
  rule: 'no-multiline-steps',
};

test('reports a step continued onto the next line', async () => {
  assert.deepEqual(await errorsFor('MultilineStep'), [{...multilineStep, line: 9}]);
});

test('reports a multiline step in a Background', async () => {
  assert.deepEqual(await errorsFor('MultilineBackgroundStep'), [{...multilineStep, line: 5}]);
});

test('reports a multiline step in a Scenario Outline', async () => {
  assert.deepEqual(await errorsFor('MultilineScenarioOutlineStep'), [{...multilineStep, line: 9}]);
});

test('keeps looking after a tag on a Background hides other problems', async () => {
  assert.deepEqual(await errorsFor('MultipleViolations'), [
    {line: 4, message: 'Tags on Backgrounds are disallowed', rule: 'no-tags-on-backgrounds'},
    {...multilineStep, line: 13},
  ]);
});

test('reports nothing for a well formed file', async () => {
  assert.deepEqual(await errorsFor('NoViolations'), []);
});

test('returns one result per file, in the order given', async () => {
  const files = ['test/linter/NoViolations.feature', 'test/linter/MultipleFeatures.feature'];
  const results = await lint(files, {}, rules);
  assert.deepEqual(
    results.map((result) => result.filePath.endsWith('MultipleFeatures.feature')),
    [false, true],
  );
});
