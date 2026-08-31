/**
 * Reading feature files ahead of the one being used, but only so far ahead.
 *
 * That the window really is bounded is settled in test/util/stream.test.ts,
 * where the reading can be held still and watched. What matters here is that
 * the linter and the statistics go through it and come out with the same
 * answers they always did.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {DEFAULT_READ_AHEAD, readAndParseFiles} from '../src/gherkin/parse.ts';
import {lint} from '../src/linter.ts';
import {loadRules} from '../src/rules.ts';
import {collectStatistics, collectStatisticsFrom} from '../src/stats/collect.ts';

/** A directory of `count` feature files, named in order. */
function withFeatures(count: number, body: (files: string[]) => Promise<void>) {
  return async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-read-'));
    try {
      const files = Array.from({length: count}, (_unused, index) => {
        const file = path.join(directory, `F${String(index).padStart(3, '0')}.feature`);
        fs.writeFileSync(
          file,
          `Feature: F${index}\n\n  Scenario: S${index}\n    Given something\n    Then it works\n`,
        );
        return file;
      });
      await body(files);
    } finally {
      fs.rmSync(directory, {recursive: true, force: true});
    }
  };
}

test('the default read-ahead keeps the disk busy without being the suite size', () => {
  assert.ok(DEFAULT_READ_AHEAD > 1, 'one at a time would leave the disk idle');
  assert.ok(DEFAULT_READ_AHEAD < 100, 'a large window is the problem this fixes');
});

test(
  'results come in the order the files were given',
  withFeatures(20, async (files) => {
    const seen: string[] = [];
    for await (const result of readAndParseFiles(files, {readAhead: 3})) {
      seen.push(path.basename(result.file.relativePath));
    }
    assert.deepEqual(
      seen,
      files.map((file) => path.basename(file)),
    );
  }),
);

test(
  'how wide the window is does not change what lint reports',
  withFeatures(20, async (files) => {
    const rules = await loadRules();
    const configuration = {
      'no-dupe-file-names': 'on',
      'no-dupe-feature-names': 'on',
      'no-unnamed-scenarios': 'on',
    } as const;

    const narrow = await lint(files, configuration, rules, {readAhead: 1});
    const wide = await lint(files, configuration, rules, {readAhead: 100});

    assert.deepEqual(narrow, wide);
  }),
);

test(
  'counting through the window gives the same statistics as counting an array',
  withFeatures(15, async (files) => {
    const parsed = [];
    for await (const result of readAndParseFiles(files)) {
      parsed.push(result);
    }

    assert.deepEqual(
      await collectStatisticsFrom(readAndParseFiles(files, {readAhead: 2})),
      collectStatistics(parsed),
    );
  }),
);

test('an unreadable file in the window is a finding, not a rejection', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-read-'));
  try {
    const good = path.join(directory, 'Good.feature');
    const missing = path.join(directory, 'Missing.feature');
    fs.writeFileSync(good, 'Feature: A\n\n  Scenario: B\n    Given x\n');

    // The failures are started well before anything awaits them, so a
    // rejection here would be an unhandled one rather than a finding.
    const seen = [];
    for await (const result of readAndParseFiles([missing, good, missing])) {
      seen.push(result.errors[0]?.rule);
    }

    assert.deepEqual(seen, ['unexpected-error', undefined, 'unexpected-error']);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});
