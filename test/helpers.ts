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
export function runRule(rule: LintRule, fixture: string, configuration?: unknown): RuleError[] {
  const relativePath = `${FIXTURE_ROOT}/${fixture}`;
  const {feature, file} = parseFeature(relativePath, readFileSync(relativePath, 'utf8'));
  return rule.run(feature, file, configuration);
}

/**
 * Runs a rule over a fixture and asserts on the errors it produces. Errors
 * are compared as a set: the order a rule reports them in is not part of its
 * contract, because the linter sorts them by line before printing.
 */
export function checkRule(
  rule: LintRule,
  fixture: string,
  configuration: unknown,
  expected: readonly ExpectedError[],
): void {
  const actual = runRule(rule, fixture, configuration);
  const withRuleName = expected.map((error) => ({...error, rule: rule.name}));
  assert.deepEqual([...actual].sort(order), [...withRuleName].sort(order));
}
