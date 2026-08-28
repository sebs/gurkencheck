/**
 * The three reports, checked for the things a reader would notice missing.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {parseFeature} from '../../src/gherkin/parse.ts';
import {collectStatistics} from '../../src/stats/collect.ts';
import {getStatsFormatter, toJson, toMarkdown, toText} from '../../src/stats/format/index.ts';
import type {Statistics} from '../../src/stats/types.ts';

const FIXTURES = 'test/stats/fixtures';
const NAMES = ['Shop.feature', 'Rules.feature', 'Einkauf.feature', 'Broken.feature'];

const statistics = collectStatistics(
  NAMES.map((name) => {
    const relativePath = `${FIXTURES}/${name}`;
    return parseFeature(relativePath, readFileSync(relativePath, 'utf8'));
  }),
);

const nothing: Statistics = collectStatistics([]);
const options = {top: 10};

test('the text report opens with the size of the suite', () => {
  assert.match(toText(statistics, options), /^3 of 4 files, 3 features, 6 test cases$/mu);
});

test('the text report says a file could not be read rather than dropping it', () => {
  const text = toText(statistics, options);
  assert.match(text, /Could not be read \(1 file, not counted above\)/u);
  assert.match(text, /Broken\.feature:6/u);
});

test('the text report shows reuse, the longest scenarios and the near duplicates', () => {
  const text = toText(statistics, options);
  assert.match(text, /Distinct\s+13/u);
  assert.match(text, /Longest/u);
  assert.match(text, /Buying another thing/u);
  assert.match(text, /Nearly the same \(1 group\)/u);
});

test('the text report only mentions dialects when more than one is in use', () => {
  assert.match(toText(statistics, options), /Languages/u);
  const english = collectStatistics([
    parseFeature('One.feature', 'Feature: A\n\n  Scenario: B\n    Given something\n'),
  ]);
  assert.doesNotMatch(toText(english, options), /Languages/u);
});

test('a list cut short says how much was left out', () => {
  const text = toText(statistics, {top: 2});
  assert.match(text, /… and 3 more scenarios/u);
  assert.doesNotMatch(toText(statistics, {top: 500}), /… and/u);
});

test('a report of nothing says so, in every format', () => {
  assert.equal(toText(nothing, options), 'No feature files found.');
  assert.match(toMarkdown(nothing, options), /No feature files found\./u);
  assert.equal(JSON.parse(toJson(nothing)).files.total, 0);
});

test('the Markdown report is tables under headings', () => {
  const markdown = toMarkdown(statistics, options);
  assert.match(markdown, /^# Feature file statistics$/mu);
  assert.match(markdown, /^## Inventory$/mu);
  assert.match(markdown, /^\| Features \| 3 \|$/mu);
  assert.match(markdown, /^### Nearly the same step, written more than one way$/mu);
});

test('a pipe in a step does not start a column of its own', () => {
  const piped = collectStatistics([
    parseFeature('Pipe.feature', 'Feature: A\n\n  Scenario: B\n    Given a | b\n'),
  ]);
  assert.match(toMarkdown(piped, options), /`a \\\| b`/u);
});

test('the JSON report is the whole dataset, not the shortened lists', () => {
  const report = JSON.parse(toJson(statistics));
  assert.equal(report.steps.vocabulary.length, report.steps.unique);
  assert.equal(report.files.unreadable.length, 1);
  // Indented, so that two runs can be diffed line by line.
  assert.match(toJson(statistics), /^\{\n {2}"files": \{$/mu);
});

test('a format name that is not a format has no formatter', () => {
  assert.equal(getStatsFormatter('json'), toJson);
  assert.equal(getStatsFormatter('markdown'), toMarkdown);
  assert.equal(getStatsFormatter(undefined), toText);
  assert.equal(getStatsFormatter('yaml'), undefined);
});

test('a name every object inherits is not a format', () => {
  // Reading the record straight would hand back Object.prototype.constructor
  // and run it as a formatter.
  for (const inherited of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
    assert.equal(getStatsFormatter(inherited), undefined, `${inherited} resolved to a formatter`);
  }
});

test('one entry left out is reported as one, not as one of many', () => {
  const text = toText(statistics, {top: 4});
  assert.match(text, /… and 1 more scenario$/mu);
  assert.doesNotMatch(text, /1 more (scenarios|steps|tags|groups|files)/u);

  const markdown = toMarkdown(statistics, {top: 4});
  assert.doesNotMatch(markdown, /1 more (scenarios|steps|tags|groups|files)/u);
});

test('the Markdown tag tables do not list the same tag twice', () => {
  const markdown = toMarkdown(statistics, options);
  const mostUsed = /### Most used tags\n\n([\s\S]*?)\n\n/u.exec(markdown)?.[1] ?? '';
  for (const once of statistics.tags.usedOnce) {
    // The whole cell, not a substring: @smok is the start of @smoke.
    assert.ok(!mostUsed.includes(`\`${once}\``), `${once} is in both tag tables`);
  }
});
