/**
 * The run lifecycle: state that belongs to one run rather than to the module.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {lint} from '../src/linter.ts';
import {beginRun, finishRun, newRunContext, runEnabledRules} from '../src/rules.ts';
import type {LintRule} from '../src/types.ts';

const FILE = 'test/linter/NoViolations.feature';

/** A rule that counts the files it sees and reports the tally at the end. */
function countingRule(name: string): LintRule {
  return {
    name,
    run(_feature, file, _configuration, context) {
      const seen = context.state<string[]>(() => []);
      seen.push(file.relativePath);
      return [];
    },
    onRunEnd(_configuration, context) {
      const seen = context.state<string[]>(() => []);
      return [{message: `saw ${seen.length}`, rule: name, line: 0, filePath: seen[0]}];
    },
  };
}

test('a context keeps one rule state for the whole run', async () => {
  const rules = new Map([['counting', countingRule('counting')]]);
  const results = await lint([FILE, FILE, FILE], {counting: 'on'}, rules);

  assert.deepEqual(
    results.flatMap((result) => result.errors.map((error) => error.message)),
    ['saw 3'],
  );
});

// The bug this whole lifecycle exists to fix: module scope is process-global,
// so two runs at once used to write into the same Map.
test('two runs at once do not see each other state', async () => {
  const rules = new Map([['counting', countingRule('counting')]]);

  const [one, two] = await Promise.all([
    lint([FILE], {counting: 'on'}, rules),
    lint([FILE, FILE, FILE, FILE], {counting: 'on'}, rules),
  ]);

  assert.equal(one.flatMap((r) => r.errors)[0]?.message, 'saw 1');
  assert.equal(two.flatMap((r) => r.errors)[0]?.message, 'saw 4');
});

test('state is per rule, not shared between them', async () => {
  const rules = new Map([
    ['first', countingRule('first')],
    ['second', countingRule('second')],
  ]);
  const results = await lint([FILE, FILE], {first: 'on', second: 'on'}, rules);

  assert.deepEqual(
    results.flatMap((result) => result.errors.map((error) => error.message)),
    ['saw 2', 'saw 2'],
  );
});

test('onRunStart is told the run is beginning, before any file', async () => {
  const order: string[] = [];
  const rules = new Map<string, LintRule>([
    [
      'noisy',
      {
        name: 'noisy',
        onRunStart: () => void order.push('start'),
        run: () => {
          order.push('file');
          return [];
        },
        onRunEnd: () => {
          order.push('end');
          return [];
        },
      },
    ],
  ]);

  await lint([FILE, FILE], {noisy: 'on'}, rules);
  assert.deepEqual(order, ['start', 'file', 'file', 'end']);
});

test('a disabled rule is left out of the lifecycle entirely', async () => {
  const order: string[] = [];
  const rules = new Map<string, LintRule>([
    [
      'off-rule',
      {
        name: 'off-rule',
        onRunStart: () => void order.push('start'),
        run: () => [],
        onRunEnd: () => {
          order.push('end');
          return [];
        },
      },
    ],
  ]);

  await lint([FILE], {'off-rule': 'off'}, rules);
  assert.deepEqual(order, []);
});

test('a rule that throws at the end of a run is reported, not swallowed', async () => {
  const rules = new Map<string, LintRule>([
    [
      'exploding',
      {
        name: 'exploding',
        run: () => [],
        onRunEnd: () => {
          throw new Error('the tally would not add up');
        },
      },
    ],
  ]);

  const results = await lint([FILE], {exploding: 'on'}, rules);
  assert.deepEqual(results[0]?.errors, [
    {
      line: 0,
      message: 'Rule "exploding" failed at the end of the run: the tally would not add up',
      rule: 'unexpected-error',
    },
  ]);
});

test('one rule failing at the end does not cost the others their findings', async () => {
  const rules = new Map<string, LintRule>([
    [
      'exploding',
      {
        name: 'exploding',
        run: () => [],
        onRunEnd: () => {
          throw new Error('boom');
        },
      },
    ],
    ['counting', countingRule('counting')],
  ]);

  const results = await lint([FILE], {exploding: 'on', counting: 'on'}, rules);
  assert.deepEqual(
    results[0]?.errors.map((error) => error.rule).sort(),
    ['counting', 'unexpected-error'],
  );
});

test('a run-end finding takes the severity its configuration asks for', async () => {
  const rules = new Map([['counting', countingRule('counting')]]);
  const results = await lint([FILE], {counting: 'warn'}, rules);

  assert.equal(results[0]?.errors[0]?.severity, 'warning');
});

test('runEnabledRules on its own starts a run of that one file', async () => {
  const rule = countingRule('counting');
  const rules = new Map([['counting', rule]]);
  const context = newRunContext();

  // Used without a run, each call is its own run and remembers nothing.
  await runEnabledRules(undefined, {relativePath: 'a.feature', lines: []}, {counting: 'on'}, rules);
  const errors = await runEnabledRules(
    undefined,
    {relativePath: 'b.feature', lines: []},
    {counting: 'on'},
    rules,
  );
  assert.deepEqual(errors, []);

  // Given a run, the calls belong together.
  const run = beginRun(rules, {counting: 'on'});
  await runEnabledRules(undefined, {relativePath: 'a.feature', lines: []}, {counting: 'on'}, rules, run);
  await runEnabledRules(undefined, {relativePath: 'b.feature', lines: []}, {counting: 'on'}, rules, run);
  const findings = await finishRun(rules, {counting: 'on'}, run);

  assert.equal(findings[0]?.message, 'saw 2');
  assert.ok(context, 'newRunContext is exported for testing a rule on its own');
});
