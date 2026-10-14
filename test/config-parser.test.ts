import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {after, before, test} from 'node:test';
import {DEFAULT_CONFIG_FILE_NAME, findConfigFile, readConfiguration} from '../src/config-parser.ts';
import {verifyConfiguration} from '../src/config-verifier.ts';
import {RECOMMENDED} from '../src/presets.ts';
import {loadRules} from '../src/rules.ts';

const rules = await loadRules();
const FIXTURES = path.resolve('test/config-parser');

test('reads a configuration file', async () => {
  const result = await readConfiguration(`${FIXTURES}/good-config.gurkencheckrc`, rules);
  assert.ok(result.ok);
  assert.deepEqual(result.configuration, {'no-files-without-scenarios': 'off'});
});

test('allows comments in a configuration file', async () => {
  const result = await readConfiguration(`${FIXTURES}/good-config-with-comments.gurkencheckrc`, rules);
  assert.ok(result.ok);
  assert.deepEqual(result.configuration, {'no-files-without-scenarios': 'off'});
});

test('reports a configuration file that does not exist', async () => {
  const result = await readConfiguration('./non/existing/path', rules);
  assert.ok(!result.ok);
  assert.match(result.message, /Could not find specified config file "\.\/non\/existing\/path"/u);
});

test('reports a rule name that does not exist', async () => {
  const result = await readConfiguration(`${FIXTURES}/bad-config.gurkencheckrc`, rules);
  assert.ok(!result.ok);
  assert.equal(result.message, `Error(s) in configuration file "${FIXTURES}/bad-config.gurkencheckrc":`);
  assert.deepEqual(result.details, ['Rule "fake-rule" does not exist']);
});

test('says which extended file a mistake is in', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-origin-'));
  try {
    fs.writeFileSync(path.join(directory, 'team.json'), '{"fake-rule": "on", "language": "fr"}');
    fs.writeFileSync(path.join(directory, 'top.json'), '{"extends": "./team.json", "also-fake": "on"}');
    const result = await readConfiguration(path.join(directory, 'top.json'), rules);
    assert.ok(!result.ok);
    assert.deepEqual(result.details.sort(), [
      'Rule "also-fake" does not exist',
      `Rule "fake-rule" does not exist (in "${path.relative(process.cwd(), path.join(fs.realpathSync(directory), 'team.json'))}")`,
    ]);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('reports a configuration file that is not valid JSON', async () => {
  const broken = path.join(os.tmpdir(), `gurkencheck-broken-${process.pid}.jsonc`);
  fs.writeFileSync(broken, '{ "no-empty-file": ');
  try {
    const result = await readConfiguration(broken, rules);
    assert.ok(!result.ok);
    assert.match(result.message, /Could not read config file/u);
    assert.match(result.details[0]!, /Could not parse/u);
  } finally {
    fs.rmSync(broken);
  }
});

test('reports a configuration file that is not an object', async () => {
  const notAnObject = path.join(os.tmpdir(), `gurkencheck-array-${process.pid}.jsonc`);
  fs.writeFileSync(notAnObject, '["no-empty-file"]');
  try {
    const result = await readConfiguration(notAnObject, rules);
    assert.ok(!result.ok);
    assert.match(result.details[0]!, /must hold a JSON object/u);
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

test(`finds ${DEFAULT_CONFIG_FILE_NAME} in the working directory`, async () => {
  fs.writeFileSync(DEFAULT_CONFIG_FILE_NAME, '{"no-empty-file": "on"}');
  const result = await readConfiguration(undefined, rules);
  assert.ok(result.ok);
  assert.deepEqual(result.configuration, {'no-empty-file': 'on'});
});

// https://github.com/gherkin-lint/gherkin-lint/issues/96
test(`falls back to the recommended preset with no ${DEFAULT_CONFIG_FILE_NAME}`, async () => {
  fs.rmSync(DEFAULT_CONFIG_FILE_NAME, {force: true});
  const result = await readConfiguration(undefined, rules);
  assert.ok(result.ok);
  assert.deepEqual(result.configuration, RECOMMENDED);
  assert.equal(result.source, 'the recommended preset');
});

test('the recommended preset names only rules that exist', async () => {
  assert.deepEqual(verifyConfiguration(RECOMMENDED, rules), []);
});

test('the recommended preset holds no style rules', async () => {
  // Style is a decision for a team, not a default to inherit.
  for (const styleRule of [
    'indentation',
    'name-length',
    'use-and',
    'file-name',
    'new-line-at-eof',
    'no-trailing-spaces',
    'no-multiple-empty-lines',
    'one-space-between-tags',
  ]) {
    assert.ok(!(styleRule in RECOMMENDED), `${styleRule} should not be recommended`);
  }
});

test('a configuration file says where it came from', async () => {
  fs.writeFileSync(DEFAULT_CONFIG_FILE_NAME, '{"no-empty-file": "on"}');
  const result = await readConfiguration(undefined, rules);
  assert.ok(result.ok);
  assert.equal(result.source, DEFAULT_CONFIG_FILE_NAME);
});

// https://github.com/gherkin-lint/gherkin-lint/issues/139
test('extends a built-in preset', async () => {
  const result = await readConfiguration(`${FIXTURES}/extends-preset.gurkencheckrc`, rules);
  assert.ok(result.ok);
  // inherited from the preset
  assert.equal(result.configuration['no-empty-file'], 'on');
  // the file's own entry wins over the preset's
  assert.equal(result.configuration['no-trailing-spaces'], 'off');
  // and its own rules are added
  assert.equal(result.configuration['use-and'], 'on');
  // "extends" is not left behind as a rule name
  assert.ok(!('extends' in result.configuration));
});

test('extends another file, resolved from the file doing the extending', async () => {
  const result = await readConfiguration(`${FIXTURES}/extends-file.gurkencheckrc`, rules);
  assert.ok(result.ok);
  assert.deepEqual(result.configuration, {
    'no-empty-file': 'on',
    'no-trailing-spaces': 'off',
  });
});

test('extends a list, with later entries winning', async () => {
  const result = await readConfiguration(`${FIXTURES}/extends-list.gurkencheckrc`, rules);
  assert.ok(result.ok);
  assert.equal(result.configuration['no-empty-file'], 'on');
  // One from the preset, one only the shared file adds.
  assert.equal(result.configuration['no-unnamed-scenarios'], 'on');
  assert.equal(result.configuration['no-trailing-spaces'], 'on');
});

test('reports a preset that does not exist', async () => {
  const file = path.join(os.tmpdir(), `gurkencheck-preset-${process.pid}.jsonc`);
  fs.writeFileSync(file, '{"extends": "gurkencheck:nonsense"}');
  try {
    const result = await readConfiguration(file, rules);
    assert.ok(!result.ok);
    assert.match(result.details[0]!, /no built-in configuration called "gurkencheck:nonsense"/u);
  } finally {
    fs.rmSync(file);
  }
});

test('reports a package that is not installed', async () => {
  const file = path.join(os.tmpdir(), `gurkencheck-pkg-${process.pid}.jsonc`);
  fs.writeFileSync(file, '{"extends": "gurkencheck-config-nothing"}');
  try {
    const result = await readConfiguration(file, rules);
    assert.ok(!result.ok);
    assert.match(result.details[0]!, /Could not resolve the package/u);
  } finally {
    fs.rmSync(file);
  }
});

test('reports a configuration that extends itself', async () => {
  const result = await readConfiguration(`${FIXTURES}/extends-cycle.gurkencheckrc`, rules);
  assert.ok(!result.ok);
  assert.match(result.details[0]!, /ends up extending itself/u);
});

test('two entries extending the same file is not a cycle', async () => {
  const result = await readConfiguration(`${FIXTURES}/diamond/top.gurkencheckrc`, rules);
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(result.configuration['no-empty-file'], 'on');
  assert.equal(result.configuration['one-space-between-tags'], 'on');
  assert.equal(result.configuration['no-trailing-spaces'], 'on');
});

test('lists every file the configuration was read from', async () => {
  const result = await readConfiguration(`${FIXTURES}/diamond/top.gurkencheckrc`, rules);
  assert.ok(result.ok);
  assert.deepEqual(
    result.files?.map((file) => path.basename(file)).sort(),
    ['bottom.gurkencheckrc', 'left.gurkencheckrc', 'right.gurkencheckrc', 'top.gurkencheckrc'],
  );
  assert.ok(result.files?.every((file) => path.isAbsolute(file)));
});

test('a preset reached along two paths is not a cycle', async () => {
  const result = await readConfiguration(`${FIXTURES}/diamond/preset-twice.gurkencheckrc`, rules);
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(result.configuration['indentation'], 'on');
});

test('reports an extends that is not a name or a list of names', async () => {
  const file = path.join(os.tmpdir(), `gurkencheck-ext-${process.pid}.jsonc`);
  fs.writeFileSync(file, '{"extends": 42}');
  try {
    const result = await readConfiguration(file, rules);
    assert.ok(!result.ok);
    assert.match(result.details[0]!, /must be a name or a list of names/u);
  } finally {
    fs.rmSync(file);
  }
});

test('reads a configuration file starting with a byte order mark', async () => {
  const file = path.join(os.tmpdir(), `gurkencheck-bom-${process.pid}.json`);
  fs.writeFileSync(file, '﻿{"no-empty-file": "on"}');
  try {
    const result = await readConfiguration(file, rules);
    assert.ok(result.ok, JSON.stringify(result));
    assert.equal(result.configuration['no-empty-file'], 'on');
  } finally {
    fs.rmSync(file, {force: true});
  }
});

test('a configuration that is a directory is said to be one, not a parse error', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-dir-config-'));
  try {
    const result = await readConfiguration(directory, rules);
    assert.ok(!result.ok);
    // Outside the working directory, so shown as the absolute path it is.
    assert.deepEqual(result.details, [`Could not read "${directory}": it is a directory, not a file.`]);

    fs.writeFileSync(path.join(directory, 'rc.json'), '{"extends": "./"}');
    const extended = await readConfiguration(path.join(directory, 'rc.json'), rules);
    assert.ok(!extended.ok);
    assert.match(extended.details[0]!, /it is a directory, not a file/u);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('a trailing comma is fine, and an empty file is said to be empty', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-jsonc-'));
  try {
    const trailing = path.join(directory, 'trailing.json');
    fs.writeFileSync(trailing, '{\n  "no-empty-file": "on",\n}\n');
    const read = await readConfiguration(trailing, rules);
    assert.ok(read.ok);
    assert.deepEqual(read.configuration, {'no-empty-file': 'on'});

    const empty = path.join(directory, 'empty.json');
    fs.writeFileSync(empty, '// nothing yet\n');
    const refused = await readConfiguration(empty, rules);
    assert.ok(!refused.ok);
    assert.match(refused.details[0]!, /is empty\. Write \{\} in it for a configuration with no rules switched on/u);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('a configuration that is a symlink to nothing is reported, not passed over', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-dangling-'));
  const originalCwd = process.cwd();
  try {
    fs.symlinkSync('team/.gurkencheckrc', path.join(directory, '.gurkencheckrc'));
    process.chdir(directory);
    const result = await readConfiguration(undefined, rules);
    assert.ok(!result.ok);
    assert.deepEqual(result.details, [
      'Could not read ".gurkencheckrc": it is a symlink to team/.gurkencheckrc, which does not exist.',
    ]);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('a symlinked configuration extends from where it really is', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-linked-'));
  try {
    fs.mkdirSync(path.join(directory, 'shared'));
    fs.mkdirSync(path.join(directory, 'project'));
    fs.writeFileSync(path.join(directory, 'shared', 'base.json'), '{"no-empty-file": "on"}');
    fs.writeFileSync(path.join(directory, 'shared', 'team.json'), '{"extends": "./base.json"}');
    fs.symlinkSync(path.join(directory, 'shared', 'team.json'), path.join(directory, 'project', '.gurkencheckrc'));
    const result = await readConfiguration(path.join(directory, 'project', '.gurkencheckrc'), rules);
    assert.ok(result.ok, JSON.stringify(result));
    assert.deepEqual(result.configuration, {'no-empty-file': 'on'});
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('findConfigFile gives a path readConfiguration can read, from a directory or a file', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-find-'));
  try {
    fs.mkdirSync(path.join(directory, 'features'));
    fs.writeFileSync(path.join(directory, '.gurkencheckrc'), '{"no-empty-file": "on"}');
    fs.writeFileSync(path.join(directory, 'features', 'a.feature'), 'Feature: A\n');
    for (const from of [path.join(directory, 'features'), path.join(directory, 'features', 'a.feature')]) {
      const found = findConfigFile(from);
      assert.ok(found !== undefined, from);
      const read = await readConfiguration(found, rules);
      assert.ok(read.ok, `${from}: ${JSON.stringify(read)}`);
    }
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('a preset named without its prefix, or misspelt, gets the one meant', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-preset-'));
  try {
    for (const [name, message] of [
      ['recommended', /Did you mean the built-in "gurkencheck:recommended"\?/u],
      ['gurkencheck:recomended', /Did you mean "gurkencheck:recommended"\?/u],
    ] as const) {
      fs.writeFileSync(path.join(directory, 'rc.json'), JSON.stringify({extends: name}));
      const result = await readConfiguration(path.join(directory, 'rc.json'), rules);
      assert.ok(!result.ok);
      assert.match(result.details[0]!, message, name);
    }
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('a mistake in an extended file outside the working directory names it by its whole path', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-shown-'));
  try {
    fs.writeFileSync(path.join(directory, 'base.json'), '{bad');
    fs.writeFileSync(path.join(directory, 'rc.json'), '{"extends": "./base.json"}');
    const result = await readConfiguration(path.join(directory, 'rc.json'), rules);
    assert.ok(!result.ok);
    assert.ok(result.details[0]!.startsWith(`Could not parse "${path.join(fs.realpathSync(directory), 'base.json')}"`), result.details[0]);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('a name every object carries is no preset', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-proto-preset-'));
  try {
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      fs.writeFileSync(path.join(directory, 'rc.json'), JSON.stringify({extends: name}));
      const result = await readConfiguration(path.join(directory, 'rc.json'), rules);
      assert.ok(!result.ok, name);
      assert.match(result.details[0]!, /Could not resolve the package/u, name);
    }
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('a key given twice is refused, rather than the first silently dropped', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-duplicate-'));
  try {
    fs.writeFileSync(path.join(directory, 'rc.json'), '{"extends": "gurkencheck:recommended", "extends": "./b.json"}');
    const result = await readConfiguration(path.join(directory, 'rc.json'), rules);
    assert.ok(!result.ok);
    assert.match(result.details[0]!, /gives "extends" more than once; only the last would count/u);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('a configuration in a directory that may not be searched is said to be out of reach', async () => {
  if (process.platform === 'win32' || process.getuid?.() === 0) return;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-unsearchable-'));
  fs.writeFileSync(path.join(directory, 'rc.json'), '{}');
  fs.chmodSync(directory, 0o000);
  try {
    const result = await readConfiguration(path.join(directory, 'rc.json'), rules);
    assert.ok(!result.ok);
    assert.match(result.message, /^Could not read config file/u);
    assert.deepEqual(result.details, ['Could not reach it: permission was denied.']);
  } finally {
    fs.chmodSync(directory, 0o755);
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('a package that is installed but cannot be loaded is not asked whether it is installed', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-broken-package-'));
  try {
    fs.mkdirSync(path.join(directory, 'node_modules', 'team-config'), {recursive: true});
    fs.writeFileSync(path.join(directory, 'node_modules', 'team-config', 'package.json'), '{"main": "gone.json", "exports": {"./x": "./x.json"}}');
    fs.writeFileSync(path.join(directory, 'rc.json'), '{"extends": "team-config"}');
    const result = await readConfiguration(path.join(directory, 'rc.json'), rules);
    assert.ok(!result.ok);
    assert.match(result.details[0]!, /is installed in ".*team-config" but could not be loaded/u);
    assert.doesNotMatch(result.details[0]!, /Is it installed\?/u);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('a configuration module whose default export is null is said to export none', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-null-config-'));
  try {
    const packageDirectory = path.join(directory, 'node_modules', 'null-config');
    fs.mkdirSync(packageDirectory, {recursive: true});
    fs.writeFileSync(path.join(packageDirectory, 'package.json'), '{"type": "module", "exports": "./index.js"}');
    fs.writeFileSync(path.join(packageDirectory, 'index.js'), 'export default null;\n');
    fs.writeFileSync(path.join(directory, 'rc.json'), '{"extends": "null-config"}');
    const result = await readConfiguration(path.join(directory, 'rc.json'), rules);
    assert.ok(!result.ok);
    assert.match(result.details[0]!, /does not export a configuration object; its default export is null/u);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('a configuration that is not a regular file is refused, not waited on', async () => {
  if (process.platform === 'win32') return;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-fifo-config-'));
  const fifo = path.join(directory, 'rc.json');
  execFileSync('mkfifo', [fifo]);
  try {
    const result = await readConfiguration(fifo, rules);
    assert.ok(!result.ok);
    assert.match(result.details[0]!, /it is not a regular file/u);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});
