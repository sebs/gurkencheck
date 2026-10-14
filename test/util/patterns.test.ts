import assert from 'node:assert/strict';
import {test} from 'node:test';
import {compilePattern, invalidPatterns} from '../../src/util/patterns.ts';

test('a pattern is read with the u flag, so Unicode classes match', () => {
  assert.equal(compilePattern('^@\\p{Lu}').test('@Wip'), true);
  assert.equal(compilePattern('^@\\p{Lu}').test('@wip'), false);
  // Without u, . is half of an emoji and ^.$ fails on one.
  assert.equal(compilePattern('^@.$').test('@🚧'), true);
  assert.equal(compilePattern('^lorem', 'i').test('LOREM ipsum'), true);
});

test('a pattern written for the old reading still works', () => {
  // An identity escape like \- is refused under u, and was fine before it.
  assert.equal(compilePattern('^@wip\\-').test('@wip-1'), true);
  assert.deepEqual(invalidPatterns('patterns', ['^@wip\\-', '^@\\p{Lu}']), []);
  assert.equal(invalidPatterns('patterns', ['(']).length, 1);
});

test('a misspelt Unicode property is a mistake, not literal text', () => {
  assert.throws(() => compilePattern('^@\\p{Lux}'));
  assert.equal(invalidPatterns('patterns', ['^@\\p{Lux}', '\\P{Upercase}']).length, 2);
});
