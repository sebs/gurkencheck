/**
 * Shared helpers for the rule tests.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseFeature} from '../src/gherkin/parse.ts';
import {newRunContext} from '../src/rules.ts';
import type {LintRule, RuleError, RunFinding} from '../src/types.ts';

/** Where the rule fixtures live, relative to the working directory. */
const FIXTURE_ROOT = 'test/rules';

/** An expected error, without the rule name - that is filled in for you. */
export type ExpectedError = Omit<RuleError, 'rule'>;

function order(a: RuleError, b: RuleError): number {
  if (a.line !== b.line) return a.line - b.line;
  return a.message < b.message ? -1 : a.message > b.message ? 1 : 0;
}

/** Parses a fixture and runs one rule over it, as a run of that file alone. */
export function runRule(
  rule: LintRule,
  fixture: string,
  configuration?: unknown,
): RuleError[] | Promise<RuleError[]> {
  const relativePath = `${FIXTURE_ROOT}/${fixture}`;
  const {feature, file} = parseFeature(relativePath, readFileSync(relativePath, 'utf8'));
  return rule.run(feature, file, configuration, newRunContext());
}

/**
 * Runs one rule over several fixtures as a single run, and returns what it
 * reports once they have all been seen.
 *
 * This is how a rule looking across files is checked: what it finds belongs
 * to the run rather than to whichever file happened to come last.
 */
export async function runAcrossFiles(
  rule: LintRule,
  fixtures: readonly string[],
  configuration?: unknown,
): Promise<RunFinding[]> {
  const context = newRunContext();
  rule.onRunStart?.(configuration, context);

  for (const fixture of fixtures) {
    const relativePath = `${FIXTURE_ROOT}/${fixture}`;
    const {feature, file} = parseFeature(relativePath, readFileSync(relativePath, 'utf8'));
    await rule.run(feature, file, configuration, context);
  }

  return (await rule.onRunEnd?.(configuration, context)) ?? [];
}

/**
 * Runs a rule over a fixture and asserts on the errors it produces.
 *
 * Only the message, rule name and line are compared; columns are covered on
 * their own in test/rules/columns.test.ts so that every other expectation
 * stays about the thing the rule is actually checking. Errors are compared as
 * a set, because the order a rule reports them in is not part of its
 * contract - the linter sorts them by line before printing.
 */
export async function checkRule(
  rule: LintRule,
  fixture: string,
  configuration: unknown,
  expected: readonly ExpectedError[],
): Promise<void> {
  const actual = await runRule(rule, fixture, configuration);
  const lineOnly = actual.map(({message, rule: ruleName, line}) => ({message, rule: ruleName, line}));
  const withRuleName = expected.map((error) => ({...error, rule: rule.name}));
  assert.deepEqual([...lineOnly].sort(order), [...withRuleName].sort(order));
}
