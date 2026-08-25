import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {after, before, test} from 'node:test';
import {DEFAULT_CONFIG_FILE_NAME, readConfiguration} from '../src/config-parser.ts';
import {loadRules} from '../src/rules.ts';

const rules = await loadRules();
const FIXTURES = path.resolve('test/config-parser');

test('reads a configuration file', () => {
  const result = readConfiguration(`${FIXTURES}/good-config.gurkencheckrc`, rules);
  assert.ok(result.ok);
  assert.deepEqual(result.configuration, {'no-files-without-scenarios': 'off'});
});

test('allows comments in a configuration file', () => {
  const result = readConfiguration(`${FIXTURES}/good-config-with-comments.gurkencheckrc`, rules);
  assert.ok(result.ok);
  assert.deepEqual(result.configuration, {'no-files-without-scenarios': 'off'});
});

test('reports a configuration file that does not exist', () => {
  const result = readConfiguration('./non/existing/path', rules);
  assert.ok(!result.ok);
  assert.match(result.message, /Could not find specified config file "\.\/non\/existing\/path"/u);
});

test('reports a rule name that does not exist', () => {
  const result = readConfiguration(`${FIXTURES}/bad-config.gurkencheckrc`, rules);
  assert.ok(!result.ok);
  assert.equal(result.message, 'Error(s) in configuration file:');
  assert.deepEqual(result.details, ['Rule "fake-rule" does not exist']);
});

test('reports a configuration file that is not valid JSON', () => {
  const broken = path.join(os.tmpdir(), `gurkencheck-broken-${process.pid}.jsonc`);
  fs.writeFileSync(broken, '{ "no-empty-file": ');
  try {
    const result = readConfiguration(broken, rules);
    assert.ok(!result.ok);
    assert.match(result.message, /Could not parse config file/u);
  } finally {
    fs.rmSync(broken);
  }
});

test('reports a configuration file that is not an object', () => {
  const notAnObject = path.join(os.tmpdir(), `gurkencheck-array-${process.pid}.jsonc`);
  fs.writeFileSync(notAnObject, '["no-empty-file"]');
  try {
    const result = readConfiguration(notAnObject, rules);
    assert.ok(!result.ok);
    assert.match(result.details[0]!, /must be a JSON object/u);
  } finally {
    fs.rmSync(notAnObject);
  }
});

/** The default-file lookup is relative to the working directory. */
const workingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-config-'));
const originalCwd = process.cwd();

before(() => process.chdir(workingDirectory));
after(() => {
  process.chdir(originalCwd);
  fs.rmSync(workingDirectory, {recursive: true, force: true});
});

test(`finds ${DEFAULT_CONFIG_FILE_NAME} in the working directory`, () => {
  fs.writeFileSync(DEFAULT_CONFIG_FILE_NAME, '{"no-empty-file": "on"}');
  const result = readConfiguration(undefined, rules);
  assert.ok(result.ok);
  assert.deepEqual(result.configuration, {'no-empty-file': 'on'});
});

test(`reports a missing ${DEFAULT_CONFIG_FILE_NAME}`, () => {
  fs.rmSync(DEFAULT_CONFIG_FILE_NAME, {force: true});
  const result = readConfiguration(undefined, rules);
  assert.ok(!result.ok);
  assert.match(result.message, /Could not find default config file/u);
});
