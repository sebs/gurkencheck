/**
 * Results as they are ready, rather than all at the end.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {lint, lintStream} from '../src/linter.ts';
import {loadRules} from '../src/rules.ts';
import type {LintRule} from '../src/types.ts';

/** Three feature files, so the order things happen in is visible. */
function withFeatures(body: (files: string[]) => Promise<void>) {
  return async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-stream-'));
    try {
      const files = ['One', 'Two', 'Three'].map((stem) => {
        const file = path.join(directory, `${stem}.feature`);
        fs.writeFileSync(file, `Feature: ${stem}\n\n  Scenario: ${stem}\n    Given something\n`);
        return file;
      });
      await body(files);
    } finally {
      fs.rmSync(directory, {recursive: true, force: true});
    }
  };
}

/** A rule that notes each file as it is checked. */
function notingRule(into: string[]): LintRule {
  return {
    name: 'noting',
    run(_feature, file) {
      into.push(`checked ${path.basename(file.relativePath, '.feature')}`);
      return [];
    },
  };
}

test(
  'yields each result as its file is checked, not all at the end',
  withFeatures(async (files) => {
    const order: string[] = [];
    const rules = new Map([['noting', notingRule(order)]]);

    for await (const result of lintStream(files, {noting: 'on'}, rules)) {
      order.push(`yielded ${path.basename(result.filePath, '.feature')}`);
    }

    assert.deepEqual(order, [
      'checked One',
      'yielded One',
      'checked Two',
      'yielded Two',
      'checked Three',
      'yielded Three',
    ]);
  }),
);

test(
  'stops checking when the consumer stops reading',
  withFeatures(async (files) => {
    const order: string[] = [];
    const rules = new Map([['noting', notingRule(order)]]);

    for await (const result of lintStream(files, {noting: 'on'}, rules)) {
      assert.ok(result.filePath.endsWith('One.feature'));
      break;
    }

    assert.deepEqual(order, ['checked One'], 'the other two files should never be checked');
  }),
);

// A rule reporting across files cannot know what it has found until every
// file has been seen, so no result can be handed over before then.
test(
  'holds every result back while a rule that reports across files is on',
  withFeatures(async (files) => {
    const order: string[] = [];
    const rules = new Map<string, LintRule>([
      ['noting', notingRule(order)],
      ['across', {name: 'across', run: () => [], onRunEnd: () => []}],
    ]);

    for await (const result of lintStream(files, {noting: 'on', across: 'on'}, rules)) {
      order.push(`yielded ${path.basename(result.filePath, '.feature')}`);
    }

    assert.deepEqual(order, [
      'checked One',
      'checked Two',
      'checked Three',
      'yielded One',
      'yielded Two',
      'yielded Three',
    ]);
  }),
);

test(
  'the stream and lint agree, cross-file rules included',
  withFeatures(async (files) => {
    const rules = await loadRules();
    // Two of these files differ only in name, so no-dupe-scenario-names has
    // nothing to say - but no-dupe-file-names and the rest still run.
    const configuration = {
      'no-dupe-file-names': 'on',
      'no-dupe-feature-names': 'on',
      'no-unnamed-scenarios': 'on',
    } as const;

    const collected = [];
    for await (const result of lintStream(files, configuration, rules)) {
      collected.push(result);
    }

    assert.deepEqual(collected, await lint(files, configuration, rules));
  }),
);

test(
  'results come in the order the files were given',
  withFeatures(async (files) => {
    const rules = await loadRules();
    const reversed = [...files].reverse();

    const seen: string[] = [];
    for await (const result of lintStream(reversed, {}, rules)) {
      seen.push(path.basename(result.filePath));
    }

    assert.deepEqual(seen, ['Three.feature', 'Two.feature', 'One.feature']);
  }),
);

test('an empty file list yields nothing', async () => {
  const rules = await loadRules();
  const seen = [];
  for await (const result of lintStream([], {}, rules)) {
    seen.push(result);
  }
  assert.deepEqual(seen, []);
});
