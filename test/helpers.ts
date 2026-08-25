/**
 * Shared helpers for the rule tests.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseFeature} from '../src/gherkin/parse.ts';
import type {LintRule, RuleError} from '../src/types.ts';

/** Where the rule fixtures live, relative to the working directory. */
const FIXTURE_ROOT = 'test/rules';

/** An expected error, without the rule name - that is filled in for you. */
export type ExpectedError = Omit<RuleError, 'rule'>;

function order(a: RuleError, b: RuleError): number {
  if (a.line !== b.line) return a.line - b.line;
  return a.message < b.message ? -1 : a.message > b.message ? 1 : 0;
}

/** Parses a fixture and runs one rule over it. */
export function runRule(
  rule: LintRule,
  fixture: string,
  configuration?: unknown,
): RuleError[] | Promise<RuleError[]> {
  const relativePath = `${FIXTURE_ROOT}/${fixture}`;
  const {feature, file} = parseFeature(relativePath, readFileSync(relativePath, 'utf8'));
  return rule.run(feature, file, configuration);
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
