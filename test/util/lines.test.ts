import assert from 'node:assert/strict';
import {test} from 'node:test';
import {contentLines, markDocStrings} from '../../src/util/lines.ts';

const asFile = (source: string) => ({
  relativePath: 'x.feature',
  lines: source.split(/\r\n|\r|\n/),
});

test('contentLines drops the entry left by a trailing newline', () => {
  assert.deepEqual(contentLines(asFile('a\nb\n')), ['a', 'b']);
});

test('contentLines keeps a file that does not end with a newline', () => {
  assert.deepEqual(contentLines(asFile('a\nb')), ['a', 'b']);
});

test('contentLines keeps a genuine blank last line', () => {
  assert.deepEqual(contentLines(asFile('a\n\n')), ['a', '']);
});

test('contentLines never hands back the original array', () => {
  const file = asFile('a\nb');
  assert.notEqual(contentLines(file), file.lines);
});

test('markDocStrings marks a quoted block, delimiters included', () => {
  assert.deepEqual(markDocStrings(['Given x:', '"""', 'body', '"""', 'Then y']), [
    false,
    true,
    true,
    true,
    false,
  ]);
});

test('markDocStrings handles backtick delimiters and a content type', () => {
  assert.deepEqual(markDocStrings(['```json', '{}', '```']), [true, true, true]);
  assert.deepEqual(markDocStrings(['"""json', '{}', '"""']), [true, true, true]);
});

test('markDocStrings does not close a quoted block on a backtick line', () => {
  assert.deepEqual(markDocStrings(['"""', '```', '"""']), [true, true, true]);
});

test('markDocStrings treats an unterminated block as running to the end', () => {
  assert.deepEqual(markDocStrings(['"""', 'body']), [true, true]);
});

test('markDocStrings marks nothing when there is no doc string', () => {
  assert.deepEqual(markDocStrings(['Feature: A', '  Scenario: B']), [false, false]);
});
