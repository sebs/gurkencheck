import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseJsonWithComments, stripJsonComments} from '../../src/util/json.ts';

test('removes line comments', () => {
  assert.deepEqual(parseJsonWithComments('{"a": 1} // trailing'), {a: 1});
});

test('removes block comments', () => {
  assert.deepEqual(parseJsonWithComments('/* leading */ {"a": /* inline */ 1}'), {a: 1});
});

test('leaves comment markers inside strings alone', () => {
  assert.deepEqual(parseJsonWithComments('{"a": "http://example.com/*x*/"}'), {
    a: 'http://example.com/*x*/',
  });
});

test('leaves escaped quotes inside strings alone', () => {
  assert.deepEqual(parseJsonWithComments('{"a": "say \\"//\\" once"}'), {a: 'say "//" once'});
});

test('keeps the document the same length so error positions stay right', () => {
  const source = '{"a": 1} // trailing';
  assert.equal(stripJsonComments(source).length, source.length);
});

test('keeps line breaks inside block comments', () => {
  const stripped = stripJsonComments('/*\n\n*/{"a": 1}');
  assert.equal(stripped.split('\n').length, 3);
});

test('copes with an unterminated block comment', () => {
  assert.deepEqual(parseJsonWithComments('{"a": 1} /* never closed'), {a: 1});
});
