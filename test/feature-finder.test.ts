import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {after, before, beforeEach, test} from 'node:test';
import {
  DEFAULT_IGNORED_PATTERNS,
  DEFAULT_IGNORE_FILE_NAME,
  findFeatureFiles,
  readIgnorePatterns,
} from '../src/feature-finder.ts';

const FOUND = 'folder/with/found/features';
const originalCwd = process.cwd();
let workingDirectory: string;

/** Builds the same tree the old mock-fs based test used. */
function buildTree(): void {
  fs.mkdirSync(`${FOUND}/folder`, {recursive: true});
  fs.writeFileSync(`${FOUND}/a.feature`, '');
  fs.writeFileSync(`${FOUND}/folder/b.feature`, '');
  fs.writeFileSync(`${FOUND}/c.txt`, '');
  fs.mkdirSync('feature', {recursive: true});
  fs.writeFileSync('feature/f.txt', '');
  // A directory whose name ends in .feature must not be treated as a file.
  fs.mkdirSync('directory.feature', {recursive: true});
}

before(() => {
  workingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-finder-'));
  process.chdir(workingDirectory);
});

after(() => {
  process.chdir(originalCwd);
  fs.rmSync(workingDirectory, {recursive: true, force: true});
});

beforeEach(() => {
  fs.rmSync(workingDirectory, {recursive: true, force: true});
  fs.mkdirSync(workingDirectory, {recursive: true});
  process.chdir(workingDirectory);
  buildTree();
});

const bothFeatures = [`${FOUND}/a.feature`, `${FOUND}/folder/b.feature`];

test('searches the working directory recursively when given no patterns', () => {
  assert.deepEqual(findFeatureFiles([]).files, bothFeatures);
});

test('expands a "dir/**" pattern recursively', () => {
  assert.deepEqual(findFeatureFiles([`${FOUND}/**`]).files, bothFeatures);
});

test('honours a "dir/*.feature" pattern literally', () => {
  assert.deepEqual(findFeatureFiles([`${FOUND}/*.feature`]).files, [`${FOUND}/a.feature`]);
});

test('searches a directory recursively when given its path', () => {
  assert.deepEqual(findFeatureFiles([`${FOUND}/`]).files, bothFeatures);
});

test('finds a file named by an absolute path', () => {
  // A pattern is matched against paths relative to the working directory, so
  // an absolute one used to match nothing at all and report a clean run.
  assert.deepEqual(findFeatureFiles([path.resolve(`${FOUND}/a.feature`)]).files, [
    `${FOUND}/a.feature`,
  ]);
});

test('searches a directory named by an absolute path', () => {
  assert.deepEqual(findFeatureFiles([path.resolve(FOUND)]).files, bothFeatures);
});

test('never returns the same file twice', () => {
  assert.deepEqual(findFeatureFiles([`${FOUND}/**`, 'path/to/fake/**']).files, bothFeatures);
});

test('never returns a directory whose name ends in .feature', () => {
  assert.ok(!findFeatureFiles([]).files.includes('directory.feature'));
});

test('skips files matching the --ignore argument', () => {
  assert.deepEqual(findFeatureFiles([`${FOUND}/**`], [`${FOUND}/**`]).files, []);
});

test(`skips files matching ${DEFAULT_IGNORE_FILE_NAME}`, () => {
  fs.writeFileSync(DEFAULT_IGNORE_FILE_NAME, `${FOUND}/a.feature\n\n${FOUND}/**\n`);
  assert.deepEqual(findFeatureFiles([`${FOUND}/**`]).files, []);
});

test('reports a pattern that names nothing usable', () => {
  const {files, invalidPatterns} = findFeatureFiles(['badpattern**']);
  assert.deepEqual(files, []);
  assert.deepEqual(invalidPatterns, ['badpattern**']);
});

test('ignores node_modules by default', () => {
  fs.mkdirSync('node_modules/some-package', {recursive: true});
  fs.writeFileSync('node_modules/some-package/vendored.feature', '');
  assert.deepEqual(findFeatureFiles([]).files, bothFeatures);
});

test('reads ignore patterns from a file, skipping blanks and comments', () => {
  fs.writeFileSync(DEFAULT_IGNORE_FILE_NAME, '# a comment\n\nbuild/**\n  vendor/**  \n');
  assert.deepEqual(readIgnorePatterns(undefined), ['build/**', 'vendor/**']);
});

test('the --ignore argument wins over the ignore file', () => {
  fs.writeFileSync(DEFAULT_IGNORE_FILE_NAME, 'build/**\n');
  assert.deepEqual(readIgnorePatterns(['other/**']), ['other/**']);
});

// https://github.com/gherkin-lint/gherkin-lint/issues/172
test('a bare directory name in the ignore file skips the whole directory', () => {
  fs.writeFileSync(DEFAULT_IGNORE_FILE_NAME, 'folder\n');
  assert.deepEqual(findFeatureFiles([`${FOUND}/**`]).files, []);
});

test('a wildcard directory pattern in the ignore file skips the whole directory', () => {
  fs.writeFileSync(DEFAULT_IGNORE_FILE_NAME, 'f*r\n');
  assert.deepEqual(findFeatureFiles([]).files, []);
});

test('an ignore file that cannot be read falls back to the defaults', () => {
  fs.writeFileSync(DEFAULT_IGNORE_FILE_NAME, 'build\n');
  fs.chmodSync(DEFAULT_IGNORE_FILE_NAME, 0o000);
  try {
    // Running as root defeats the permission bits, so there is nothing to test.
    try {
      fs.readFileSync(DEFAULT_IGNORE_FILE_NAME, 'utf8');
      return;
    } catch {
      // Good: it really is unreadable.
    }
    assert.deepEqual(readIgnorePatterns(undefined), DEFAULT_IGNORED_PATTERNS);
  } finally {
    fs.chmodSync(DEFAULT_IGNORE_FILE_NAME, 0o644);
    fs.rmSync(DEFAULT_IGNORE_FILE_NAME, {force: true});
  }
});
