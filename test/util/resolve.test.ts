import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {after, before, test} from 'node:test';
import {resolvePackage} from '../../src/util/resolve.ts';

let project: string;
let from: string;

/** Writes a package into the project's node_modules. */
function writePackage(name: string, manifest: object, files: Record<string, string>): string {
  const directory = path.join(project, 'node_modules', name);
  fs.mkdirSync(directory, {recursive: true});
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({name, ...manifest}));
  for (const [file, contents] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(directory, file)), {recursive: true});
    fs.writeFileSync(path.join(directory, file), contents);
  }
  return fs.realpathSync(directory);
}

before(() => {
  project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-resolve-')));
  fs.mkdirSync(path.join(project, 'config'));
  from = path.join(project, 'config', '.gurkencheckrc');
});

after(() => {
  fs.rmSync(project, {recursive: true, force: true});
});

test('finds a CommonJS package as require does', () => {
  const directory = writePackage('cjs-only', {main: 'main.js'}, {'main.js': ''});
  assert.equal(resolvePackage('cjs-only', from), path.join(directory, 'main.js'));
});

test('finds a package that only exports for import', () => {
  const directory = writePackage(
    'esm-only',
    {type: 'module', exports: {import: './index.js'}},
    {'index.js': ''},
  );
  assert.equal(resolvePackage('esm-only', from), path.join(directory, 'index.js'));
});

test('follows a subpath map and nested conditions', () => {
  const directory = writePackage(
    '@acme/config',
    {exports: {'.': {node: {import: './node.js'}}, './strict': {import: './strict.js'}}},
    {'node.js': '', 'strict.js': ''},
  );
  assert.equal(resolvePackage('@acme/config', from), path.join(directory, 'node.js'));
  assert.equal(resolvePackage('@acme/config/strict', from), path.join(directory, 'strict.js'));
});

test('throws when the package is not installed', () => {
  assert.throws(() => resolvePackage('not-installed', from));
});

test('throws when the package exports nothing for import', () => {
  writePackage('browser-only', {exports: {browser: './b.js'}}, {'b.js': ''});
  assert.throws(() => resolvePackage('browser-only', from));
});
