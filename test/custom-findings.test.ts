/**
 * What a custom rule hands back is whatever it likes. These are the findings a
 * rule should not have returned, and what becomes of them.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {FORMATTERS} from '../src/formatters/index.ts';
import {hasErrors, lint} from '../src/linter.ts';
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

test('a finding naming no rule is put down to the rule that reported it', async () => {
  const errors = await findingsOf([
    {message: 'no rule', line: 1},
    {message: 'empty rule', rule: '', line: 1},
  ]);
  assert.deepEqual(
    errors.map((error) => error.rule),
    ['custom', 'custom'],
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
