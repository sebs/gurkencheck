/**
 * https://github.com/gherkin-lint/gherkin-lint/issues/268
 * https://github.com/gherkin-lint/gherkin-lint/issues/203
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readSuppressions} from '../src/suppressions.ts';
import type {RuleError} from '../src/types.ts';

const error = (rule: string, line: number): RuleError => ({message: 'x', rule, line});

function suppressions(source: string) {
  return readSuppressions(source.split('\n'));
}

test('a file with no directives suppresses nothing', () => {
  const found = suppressions('Feature: A\n  Scenario: B');
  assert.ok(found.isEmpty);
  assert.ok(!found.isSuppressed(error('use-and', 1)));
});

test('a comment that is not a directive is left alone', () => {
  const found = suppressions('# just a note about the feature\nFeature: A');
  assert.ok(found.isEmpty);
});

test('disable-next-line covers only the line below it', () => {
  const found = suppressions(
    ['Feature: A', '# gurkencheck-disable-next-line name-length', '  Scenario: B', '  Scenario: C'].join('\n'),
  );
  assert.ok(found.isSuppressed(error('name-length', 3)));
  assert.ok(!found.isSuppressed(error('name-length', 4)));
  assert.ok(!found.isSuppressed(error('use-and', 3)), 'other rules still report');
});

test('disable runs to the end of the file', () => {
  const found = suppressions(['Feature: A', '# gurkencheck-disable use-and', 'x', 'y'].join('\n'));
  assert.ok(!found.isSuppressed(error('use-and', 1)));
  assert.ok(found.isSuppressed(error('use-and', 2)));
  assert.ok(found.isSuppressed(error('use-and', 4)));
});

test('enable closes a disable', () => {
  const found = suppressions(
    ['a', '# gurkencheck-disable use-and', 'b', '# gurkencheck-enable use-and', 'c'].join('\n'),
  );
  assert.ok(found.isSuppressed(error('use-and', 3)));
  assert.ok(!found.isSuppressed(error('use-and', 5)));
});

test('enable with no names closes everything open', () => {
  const found = suppressions(
    ['a', '# gurkencheck-disable use-and, name-length', 'b', '# gurkencheck-enable', 'c'].join('\n'),
  );
  assert.ok(found.isSuppressed(error('use-and', 3)));
  assert.ok(found.isSuppressed(error('name-length', 3)));
  assert.ok(!found.isSuppressed(error('use-and', 5)));
  assert.ok(!found.isSuppressed(error('name-length', 5)));
});

test('a directive with no rule names covers every rule', () => {
  const found = suppressions(['a', '# gurkencheck-disable', 'b'].join('\n'));
  assert.ok(found.isSuppressed(error('anything-at-all', 3)));
});

test('disable-file covers the whole file, including whole-file errors', () => {
  const found = suppressions(['a', 'b', '# gurkencheck-disable-file file-name'].join('\n'));
  assert.ok(found.isSuppressed(error('file-name', 0)));
  assert.ok(found.isSuppressed(error('file-name', 1)));
  assert.ok(!found.isSuppressed(error('use-and', 1)));
});

test('several rules may be listed, separated by commas or spaces', () => {
  const found = suppressions(['# gurkencheck-disable-next-line use-and, name-length', 'x'].join('\n'));
  assert.ok(found.isSuppressed(error('use-and', 2)));
  assert.ok(found.isSuppressed(error('name-length', 2)));

  const spaced = suppressions(['# gurkencheck-disable-next-line use-and name-length', 'x'].join('\n'));
  assert.ok(spaced.isSuppressed(error('use-and', 2)));
  assert.ok(spaced.isSuppressed(error('name-length', 2)));
});

test('a directive inside a doc string is text, not a directive', () => {
  const found = suppressions(
    ['Given x:', '  """', '  # gurkencheck-disable use-and', '  """', 'y'].join('\n'),
  );
  assert.ok(found.isEmpty);
  assert.ok(!found.isSuppressed(error('use-and', 5)));
});

test('a directive may be indented', () => {
  const found = suppressions(['a', '    # gurkencheck-disable-next-line use-and', 'b'].join('\n'));
  assert.ok(found.isSuppressed(error('use-and', 3)));
});

test('an unknown rule name simply matches nothing', () => {
  const found = suppressions(['a', '# gurkencheck-disable-next-line no-such-rule', 'b'].join('\n'));
  assert.ok(!found.isSuppressed(error('use-and', 3)));
});
