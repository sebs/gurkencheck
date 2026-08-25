import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {after, before, test} from 'node:test';
import {globSync, globToRegExp} from '../../src/util/glob.ts';

const matches = (pattern: string, candidate: string): boolean =>
  globToRegExp(pattern).test(candidate);

test('* matches within one path segment only', () => {
  assert.ok(matches('*.feature', 'a.feature'));
  assert.ok(!matches('*.feature', 'dir/a.feature'));
});

test('** as a whole segment spans any number of segments', () => {
  assert.ok(matches('a/**/b.feature', 'a/b.feature'));
  assert.ok(matches('a/**/b.feature', 'a/x/y/b.feature'));
});

test('** at the end matches everything below', () => {
  assert.ok(matches('a/**', 'a/b/c.feature'));
});

test('** inside a segment behaves like *', () => {
  assert.ok(matches('a/**.feature', 'a/b.feature'));
  assert.ok(!matches('a/**.feature', 'a/b/c.feature'));
});

test('? matches a single character', () => {
  assert.ok(matches('a?.feature', 'ab.feature'));
  assert.ok(!matches('a?.feature', 'abc.feature'));
});

test('braces offer alternatives', () => {
  assert.ok(matches('*.{js,mjs}', 'rule.mjs'));
  assert.ok(!matches('*.{js,mjs}', 'rule.ts'));
});

test('character classes match and negate', () => {
  assert.ok(matches('a[bc].feature', 'ab.feature'));
  assert.ok(!matches('a[!bc].feature', 'ab.feature'));
});

test('dots and other regex characters are literal', () => {
  assert.ok(!matches('a.feature', 'axfeature'));
  assert.ok(matches('a+b.feature', 'a+b.feature'));
});

const originalCwd = process.cwd();
let root: string;

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-glob-'));
  fs.mkdirSync(path.join(root, 'features/nested'), {recursive: true});
  fs.mkdirSync(path.join(root, '.hidden'), {recursive: true});
  fs.writeFileSync(path.join(root, 'features/a.feature'), '');
  fs.writeFileSync(path.join(root, 'features/nested/b.feature'), '');
  fs.writeFileSync(path.join(root, 'features/notes.txt'), '');
  fs.writeFileSync(path.join(root, '.hidden/c.feature'), '');
  process.chdir(root);
});

after(() => {
  process.chdir(originalCwd);
  fs.rmSync(root, {recursive: true, force: true});
});

test('finds files recursively and sorts the result', () => {
  assert.deepEqual(globSync('**/*.feature'), [
    'features/a.feature',
    'features/nested/b.feature',
  ]);
});

test('skips hidden directories', () => {
  assert.ok(!globSync('**/*.feature').includes('.hidden/c.feature'));
});

test('applies ignore patterns', () => {
  assert.deepEqual(globSync('**/*.feature', {ignore: ['features/nested/**']}), [
    'features/a.feature',
  ]);
});

test('returns nothing for a directory that does not exist', () => {
  assert.deepEqual(globSync('missing/**/*.feature'), []);
});

test('matches a single named file', () => {
  assert.deepEqual(globSync('features/a.feature'), ['features/a.feature']);
});

test('never returns directories', () => {
  assert.deepEqual(globSync('features/*'), ['features/a.feature', 'features/notes.txt']);
});

// https://github.com/gherkin-lint/gherkin-lint/issues/172
test('an ignore pattern matching a directory skips everything under it', () => {
  assert.deepEqual(globSync('**/*.feature', {ignore: ['features']}), []);
});

test('an ignore pattern with a wildcard still matches a directory', () => {
  assert.deepEqual(globSync('**/*.feature', {ignore: ['f*s']}), []);
  assert.deepEqual(globSync('**/*.feature', {ignore: ['*/nested']}), ['features/a.feature']);
});

test('an ignore pattern that matches nothing leaves the result alone', () => {
  assert.deepEqual(globSync('**/*.feature', {ignore: ['elsewhere']}), [
    'features/a.feature',
    'features/nested/b.feature',
  ]);
});
