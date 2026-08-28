/**
 * The collector, run over a small suite whose numbers can be counted by hand:
 * an English feature with a Background and an Outline, one using `Rule:`, one
 * written in German, a file the parser refuses, and an empty one.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {parseFeature} from '../../src/gherkin/parse.ts';
import {collectStatistics, distribution} from '../../src/stats/collect.ts';
import type {Statistics} from '../../src/stats/types.ts';

const FIXTURES = 'test/stats/fixtures';

/** Parses the named fixtures, in the order given. */
function collect(...names: string[]): Statistics {
  return collectStatistics(
    names.map((name) => {
      const relativePath = `${FIXTURES}/${name}`;
      return parseFeature(relativePath, readFileSync(relativePath, 'utf8'));
    }),
  );
}

const all = collect(
  'Shop.feature',
  'Rules.feature',
  'Einkauf.feature',
  'Broken.feature',
  'Empty.feature',
);

test('a file the parser refuses is listed rather than half counted', () => {
  assert.equal(all.files.total, 5);
  assert.equal(all.files.parsed, 4);
  assert.deepEqual(
    all.files.unreadable.map((file) => file.file),
    [`${FIXTURES}/Broken.feature`],
  );
  assert.match(all.files.unreadable[0]?.reason ?? '', /Multiple "Feature" definitions/u);
});

test('an empty file is read, and holds nothing to count', () => {
  const empty = collect('Empty.feature');
  assert.equal(empty.files.parsed, 1);
  assert.deepEqual(empty.files.unreadable, []);
  assert.equal(empty.inventory.features, 0);
});

test('the inventory counts what is in the files, Rules included', () => {
  assert.deepEqual(all.inventory, {
    features: 3,
    rules: 1,
    backgrounds: 2,
    scenarios: 4,
    scenarioOutlines: 1,
    examplesTables: 1,
    examplesRows: 2,
    steps: 18,
    dataTables: 1,
    docStrings: 1,
  });
});

test('an Examples row is a test case of its own', () => {
  // Four Scenarios, and an Outline standing for the two rows of its table.
  assert.equal(all.scenarios.effective, 6);
});

test('steps per scenario leave out the Background', () => {
  assert.deepEqual(all.scenarios.stepsPerScenario, {
    count: 5,
    min: 2,
    median: 3,
    p90: 4,
    max: 4,
    mean: 3.2,
  });
});

test('the longest scenarios come first, named and located', () => {
  const longest = all.scenarios.largest[0];
  assert.equal(longest?.steps, 4);
  assert.equal(longest?.file, `${FIXTURES}/Shop.feature`);
});

test('steps written the same way in two files count as one step', () => {
  const voucher = all.steps.vocabulary.find((entry) => entry.text === 'i have a voucher');
  assert.equal(voucher?.count, 2);
  // The first sighting is the one reported, so the reader has somewhere to go.
  assert.equal(voucher?.file, `${FIXTURES}/Shop.feature`);
  assert.equal(voucher?.example, 'I have a voucher');
});

test('reuse is measured against the distinct steps', () => {
  assert.equal(all.steps.total, 18);
  assert.equal(all.steps.unique, 13);
  assert.equal(all.steps.uniqueRatio, 13 / 18);
  assert.equal(all.steps.usedOnce, 9);
});

test('the vocabulary is most used first', () => {
  assert.deepEqual(all.steps.vocabulary.slice(0, 2).map((entry) => [entry.text, entry.count]), [
    ['i see 0 order', 3],
    ['i check out', 2],
  ]);
});

test('an outline placeholder and the value written in its place are reported together', () => {
  assert.deepEqual(
    all.steps.similar.map((group) => group.members.map((member) => member.text)),
    [['i have 0 items in my cart', 'i have <> items in my cart']],
  );
  assert.equal(all.steps.similar[0]?.total, 3);
});

test('And and But are resolved to the keyword they carry on from', () => {
  // Shop has an `And` under a `Given`, and the German feature an `Und`.
  assert.deepEqual(all.steps.keywords, {given: 8, when: 5, then: 5, other: 0});
});

test('an And written first resolves to nothing rather than to Given', () => {
  const stray = collectStatistics([
    parseFeature('Stray.feature', 'Feature: A\n\n  Scenario: B\n    And something\n'),
  ]);
  assert.deepEqual(stray.steps.keywords, {given: 0, when: 0, then: 0, other: 1});
});

test('tags are counted wherever they are written', () => {
  assert.equal(all.tags.total, 4);
  assert.deepEqual(all.tags.vocabulary, [
    {name: '@smoke', count: 2},
    {name: '@smok', count: 1},
    {name: '@web', count: 1},
  ]);
  assert.deepEqual(all.tags.usedOnce, ['@smok', '@web']);
});

test('a scenario inheriting a tag is not counted as untagged', () => {
  // Only the second Shop scenario and the German one carry nothing at all;
  // the scenario inside the Rule inherits the Feature's @web.
  assert.equal(all.tags.untaggedScenarios, 2);
});

test('the dialect of each file is counted', () => {
  assert.deepEqual(all.languages, [
    {code: 'en', files: 2},
    {code: 'de', files: 1},
  ]);
});

test('a German feature is counted like any other', () => {
  const german = collect('Einkauf.feature');
  assert.equal(german.inventory.scenarios, 1);
  assert.equal(german.inventory.steps, 4);
  assert.deepEqual(german.steps.keywords, {given: 2, when: 1, then: 1, other: 0});
});

test('nothing at all is a report of zeroes rather than a crash', () => {
  const nothing = collectStatistics([]);
  assert.equal(nothing.files.total, 0);
  assert.equal(nothing.steps.uniqueRatio, 0);
  assert.deepEqual(nothing.scenarios.stepsPerScenario, {
    count: 0,
    min: 0,
    median: 0,
    p90: 0,
    max: 0,
    mean: 0,
  });
});

test('quantiles are values something actually has, not averages of two', () => {
  assert.deepEqual(distribution([1, 2, 3, 4]), {
    count: 4,
    min: 1,
    median: 2,
    p90: 4,
    max: 4,
    mean: 2.5,
  });
});
