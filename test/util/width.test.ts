import assert from 'node:assert/strict';
import {test} from 'node:test';
import {displayWidth, padEndToWidth, truncateToWidth} from '../../src/util/width.ts';

test('counts the columns a terminal gives text', () => {
  assert.equal(displayWidth('abc'), 3);
  assert.equal(displayWidth('ログイン'), 8);
  assert.equal(displayWidth('로그인'), 6);
  assert.equal(displayWidth('🚀a'), 3);
  assert.equal(displayWidth('é'), 1);
});

test('pads and cuts by columns', () => {
  assert.equal(padEndToWidth('ログ', 6), 'ログ  ');
  assert.equal(truncateToWidth('ログイン', 5), 'ログ…');
  assert.equal(truncateToWidth('ab', 5), 'ab');
});
