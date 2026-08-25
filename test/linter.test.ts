import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
      column: 1,
      message: 'Multiple "Background" definitions in the same file are disallowed',
      rule: 'up-to-one-background-per-file',
    },
  ]);
});

test('reports a tag on a Background', async () => {
  assert.deepEqual(await errorsFor('TagOnBackground'), [
    {line: 4, column: 1, message: 'Tags on Backgrounds are disallowed', rule: 'no-tags-on-backgrounds'},
  ]);
});

test('reports a second Feature in one file', async () => {
  assert.deepEqual(await errorsFor('MultipleFeatures'), [
    {
      line: 7,
      column: 1,
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
  assert.deepEqual(await errorsFor('MultilineStep'), [{...multilineStep, line: 9, column: 6}]);
});

test('reports a multiline step in a Background', async () => {
  assert.deepEqual(await errorsFor('MultilineBackgroundStep'), [
    {...multilineStep, line: 5, column: 5},
  ]);
});

test('reports a multiline step in a Scenario Outline', async () => {
  assert.deepEqual(await errorsFor('MultilineScenarioOutlineStep'), [
    {...multilineStep, line: 9, column: 6},
  ]);
});

test('keeps looking after a tag on a Background hides other problems', async () => {
  assert.deepEqual(await errorsFor('MultipleViolations'), [
    {line: 4, column: 3, message: 'Tags on Backgrounds are disallowed', rule: 'no-tags-on-backgrounds'},
    {...multilineStep, line: 13, column: 6},
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

// https://github.com/gherkin-lint/gherkin-lint/issues/268
// https://github.com/gherkin-lint/gherkin-lint/issues/203
const SUPPRESSION_CONFIG = {'use-and': 'on', 'name-length': ['on', {Scenario: 5}]} as const;

async function errorsForSource(source: string, config: object = SUPPRESSION_CONFIG) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-inline-'));
  const file = path.join(directory, 'Example.feature');
  try {
    fs.writeFileSync(file, source);
    const results = await lint([file], config as never, rules);
    return results[0]!.errors;
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
}

const TWO_PROBLEMS = [
  'Feature: A',
  '',
  '  Scenario: A scenario with a name that is too long',
  '    Given my first sentence',
  '    Given my second sentence',
  '',
].join('\n');

test('without a directive both problems are reported', async () => {
  const errors = await errorsForSource(TWO_PROBLEMS);
  assert.deepEqual(errors.map((error) => error.rule).sort(), ['name-length', 'use-and']);
});

test('a directive switches off one rule and leaves the rest working', async () => {
  const errors = await errorsForSource(
    TWO_PROBLEMS.replace('  Scenario:', '  # gurkencheck-disable-next-line name-length\n  Scenario:'),
  );
  assert.deepEqual(errors.map((error) => error.rule), ['use-and']);
});

test('a ranged directive covers everything below it', async () => {
  const errors = await errorsForSource(`# gurkencheck-disable\n${TWO_PROBLEMS}`);
  assert.deepEqual(errors, []);
});

test('a parse error cannot be suppressed', async () => {
  const errors = await errorsForSource(
    [
      '# gurkencheck-disable-file',
      'Feature: A',
      '',
      '  Scenario: S',
      '    Given x',
      '',
      'Feature: B',
      '',
    ].join('\n'),
    {},
  );
  assert.deepEqual(errors.map((error) => error.rule), ['one-feature-per-file']);
});
