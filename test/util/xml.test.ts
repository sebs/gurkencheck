import assert from 'node:assert/strict';
import {test} from 'node:test';
import {attributes, cdata, escapeXml} from '../../src/util/xml.ts';

test('escapes the five reserved characters', () => {
  assert.equal(escapeXml(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&apos;');
});

test('renders attributes and skips missing ones', () => {
  assert.equal(attributes({name: 'a b', type: undefined, count: 2}), ' name="a b" count="2"');
});

test('escapes attribute values', () => {
  assert.equal(attributes({name: 'a"b'}), ' name="a&quot;b"');
});

test('wraps text in CDATA', () => {
  assert.equal(cdata('a < b'), '<![CDATA[a < b]]>');
});

test('splits CDATA around a nested terminator', () => {
  assert.equal(cdata('a]]>b'), '<![CDATA[a]]]]><![CDATA[>b]]>');
});
