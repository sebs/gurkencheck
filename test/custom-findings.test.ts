/**
 * What a custom rule hands back is whatever it likes. These are the findings a
 * rule should not have returned, and what becomes of them.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {FORMATTERS} from '../src/formatters/index.ts';
import {hasErrors, lint} from '../src/linter.ts';
import {loadRules} from '../src/rules.ts';
import type {LintRule, RuleError} from '../src/types.ts';

const FILE = 'test/linter/NoViolations.feature';

/** What a formatter prints, rather than letting it reach the console. */
async function printed(body: () => unknown): Promise<string> {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  try {
    const returned = await body();
    if (typeof returned === 'string') lines.push(returned);
  } finally {
    console.log = originalLog;
  }
  return lines.join('\n');
}

/** Lints one file with a single custom rule handing back `findings`. */
async function findingsOf(findings: unknown[]): Promise<RuleError[]> {
  const rule = {name: 'custom', run: () => findings} as unknown as LintRule;
  const results = await lint([FILE], {custom: 'on'}, new Map([['custom', rule]]));
  return results.flatMap((result) => result.errors);
}

test('a finding with no message says so, and every formatter can write it', async () => {
  const errors = await findingsOf([{rule: 'custom', line: 1}, {message: 42, line: 2}]);
  assert.deepEqual(
    errors.map((error) => error.message),
    ['Rule "custom" reported a finding with no message', '42'],
  );

  const results = [{filePath: FILE, errors}];
  for (const [name, format] of Object.entries(FORMATTERS)) {
    const output = await printed(() => format(results));
    assert.match(output, /reported a finding with no message/u, name);
    assert.doesNotMatch(output, /undefined/u, name);
  }
});

test('a finding is put down to the rule that reported it', async () => {
  const errors = await findingsOf([
    {message: 'no rule', line: 1},
    {message: 'empty rule', rule: '', line: 1},
    {message: 'another rule', rule: 'no-trailing-spaces', line: 1},
  ]);
  assert.deepEqual(
    errors.map((error) => error.rule),
    ['custom', 'custom', 'custom'],
  );
});

test('a rule set to warn never fails the run, whatever its findings say', async () => {
  const rule = {
    name: 'custom',
    run: () => [
      {message: 'says error', rule: 'custom', line: 1, severity: 'error'},
      {message: 'says info', rule: 'custom', line: 1, severity: 'info'},
    ],
  } as unknown as LintRule;
  const rules = new Map([['custom', rule]]);

  const warned = await lint([FILE], {custom: 'warn'}, rules);
  assert.deepEqual(
    warned[0]!.errors.map((error) => error.severity),
    ['warning', 'warning'],
  );
  assert.equal(hasErrors(warned), false);

  // Set to on, an unknown severity counts as the error the configuration asks for.
  const on = await lint([FILE], {custom: 'on'}, rules);
  assert.deepEqual(
    on[0]!.errors.map((error) => error.severity),
    ['error', 'error'],
  );
});

test('a rule set to on may still mark a finding as only a warning', async () => {
  const errors = await findingsOf([{message: 'soft', rule: 'custom', line: 1, severity: 'warning'}]);
  assert.equal(errors[0]!.severity, 'warning');
});

test('a column is kept only where it can be one', async () => {
  const errors = await findingsOf([
    {message: 'good', rule: 'custom', line: 2, column: 3},
    {message: 'zero', rule: 'custom', line: 2, column: 0},
    {message: 'fraction', rule: 'custom', line: 2, column: 1.5},
    {message: 'no line', rule: 'custom', line: 'two', column: 3},
  ]);
  // Findings come back in line order, so they are told apart by message.
  assert.deepEqual(
    Object.fromEntries(errors.map(({message, line, column}) => [message, [line, column]])),
    {
      good: [2, 3],
      zero: [2, undefined],
      fraction: [2, undefined],
      'no line': [0, undefined],
    },
  );
});

test('something that is not a finding is reported in its place, and the rest are kept', async () => {
  const errors = await findingsOf([null, 'oops', {message: 'kept', line: 1}]);
  assert.deepEqual(
    errors.map(({message, rule}) => [message, rule]),
    [
      ['Rule "custom" returned null among its findings', 'unexpected-error'],
      ['Rule "custom" returned string among its findings', 'unexpected-error'],
      ['kept', 'custom'],
    ],
  );
});

test('a message that cannot be made into text is said to be one, and the run goes on', async () => {
  const errors = await findingsOf([
    {message: Object.create(null), line: 1},
    {message: {toString: () => { throw new Error('no'); }}, line: 2},
  ]);
  assert.deepEqual(
    errors.map((error) => error.message),
    [
      'Rule "custom" reported a message that cannot be shown as text',
      'Rule "custom" reported a message that cannot be shown as text',
    ],
  );
});

test('a finding that throws when read costs its rule only, and the run goes on', async () => {
  const throwing = {
    line: 1,
    get message(): string {
      throw new Error('getter boom');
    },
  };
  const list = new Proxy([{message: 'x', line: 1}], {
    get(target, key, receiver) {
      if (key === 'length') throw new Error('proxy boom');
      return Reflect.get(target, key, receiver) as unknown;
    },
  });
  for (const [found, reason] of [[[{message: 'lost', line: 1}, throwing], 'getter boom'], [list, 'proxy boom']] as const) {
    const rules = new Map<string, LintRule>([
      ['custom', {name: 'custom', run: () => found} as unknown as LintRule],
      ['other', {name: 'other', run: () => [{message: 'kept', line: 1}]} as unknown as LintRule],
    ]);
    const results = await lint([FILE], {custom: 'on', other: 'on'}, rules);
    assert.deepEqual(
      results[0]!.errors.map(({message, rule}) => [message, rule]),
      [
        [`Rule "custom" failed: ${reason}`, 'unexpected-error'],
        ['kept', 'other'],
      ],
    );
  }
});

test('a rule set to warn that crashes only warns', async () => {
  const rule = {name: 'custom', run: () => { throw new Error('boom'); }} as unknown as LintRule;
  const results = await lint([FILE], {custom: 'warn'}, new Map([['custom', rule]]));
  assert.deepEqual(
    results[0]!.errors.map(({rule: name, severity}) => [name, severity]),
    [['unexpected-error', 'warning']],
  );
  assert.equal(hasErrors(results), false);
});

test('a rule changing the file it is handed fails, and changes nothing else', async () => {
  const meddling = {
    name: 'meddling',
    run: (_feature: unknown, file: {lines: string[]}) => {
      file.lines.reverse();
      return [];
    },
  } as unknown as LintRule;
  const rules = new Map([...(await loadRules()), ['meddling', meddling]]);
  const source = 'Feature: A\n  # gurkencheck-disable-next-line no-unnamed-scenarios\n  Scenario:\n    Given b\n  Scenario:\n    Given c\n';
  const file = path.join(os.tmpdir(), `gurkencheck-meddling-${process.pid}.feature`);
  fs.writeFileSync(file, source);
  try {
    const [result] = await lint([file], {meddling: 'on', 'no-unnamed-scenarios': 'on'}, rules);
    assert.deepEqual(
      result!.errors.map(({rule, line}) => [rule, line]),
      [
        ['unexpected-error', 0],
        ['no-unnamed-scenarios', 5],
      ],
    );
  } finally {
    fs.rmSync(file, {force: true});
  }
});
