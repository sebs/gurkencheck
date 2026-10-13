/**
 * What a custom rule hands back is whatever it likes. These are the findings a
 * rule should not have returned, and what becomes of them.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {FORMATTERS} from '../src/formatters/index.ts';
import {lint} from '../src/linter.ts';
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
