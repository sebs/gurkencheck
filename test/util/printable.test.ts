import assert from 'node:assert/strict';
import {test} from 'node:test';
import {printable} from '../../src/util/printable.ts';

test('writes out what would act rather than show', () => {
  assert.equal(printable('a\nb\tc'), 'a\\nb\\tc');
  assert.equal(printable('\u001b[2J'), '\\u001b[2J');
  for (const character of ['\u0085', '؜', '‎', '‮', '⁦', ' ', ' ', '﻿']) {
    assert.equal(printable(character), `\\u${character.codePointAt(0)!.toString(16).padStart(4, '0')}`);
  }
});

test('leaves a family emoji, held together by zero-width joiners, as it is', () => {
  assert.equal(printable('👨‍👩‍👧 café'), '👨‍👩‍👧 café');
});

test('text that only looks like an escape cannot pass for one, nor one for text', () => {
  assert.equal(printable('\u202E and \\u202e'), '\\u202e and \\\\u202e');
  assert.equal(printable('a\\nb'), 'a\\\\nb');
  assert.equal(printable('C:\\Users\\x'), 'C:\\Users\\x', 'a backslash starting nothing stays single');
});

test('a character beyond four hex digits is written out in braces', () => {
  assert.equal(printable('\u{E0041}1'), '\\u{e0041}1');
});
