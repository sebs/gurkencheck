/**
 * The `stats` subcommand, run as a real process.
 */
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {promisify} from 'node:util';

const run = promisify(execFile);
const CLI = path.resolve('src/main.ts');
const FIXTURES = 'test/stats/fixtures';

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function cli(args: string[], cwd = process.cwd()): Promise<CliResult> {
  try {
    const {stdout, stderr} = await run(process.execPath, [CLI, ...args], {cwd});
    return {code: 0, stdout, stderr};
  } catch (thrown) {
    const error = thrown as {code?: number; stdout?: string; stderr?: string};
    return {code: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? ''};
  }
}

test('the linter usage mentions the stats command', async () => {
  const {stdout} = await cli(['--help']);
  assert.match(stdout, /Commands:/u);
  assert.match(stdout, /stats \[paths\]/u);
});

test('stats --help explains the subcommand and its own formats', async () => {
  const {code, stdout} = await cli(['stats', '--help']);
  assert.equal(code, 0);
  assert.match(stdout, /Usage: gurkencheck stats/u);
  assert.match(stdout, /--top <n>/u);
});

test('stats reports on the files and exits 0', async () => {
  const {code, stdout, stderr} = await cli(['stats', FIXTURES]);
  assert.equal(code, 0);
  assert.equal(stderr, '');
  assert.match(stdout, /Inventory/u);
  assert.match(stdout, /Test cases\s+6/u);
});

test('stats writes JSON to stdout, so it can be piped', async () => {
  const {code, stdout} = await cli(['stats', FIXTURES, '--format', 'json']);
  assert.equal(code, 0);
  const report = JSON.parse(stdout);
  assert.equal(report.inventory.features, 3);
  assert.equal(report.scenarios.effective, 6);
});

test('--top cuts every list to the same length', async () => {
  const {stdout} = await cli(['stats', FIXTURES, '--top', '1']);
  assert.match(stdout, /… and 4 more scenarios/u);
});

test('a file the parser refuses does not fail the run', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-stats-'));
  try {
    // A second Feature is only rejected once the first has a child; on its
    // own it reads as more of the first Feature's description.
    fs.writeFileSync(
      path.join(cwd, 'Broken.feature'),
      'Feature: One\n\n  Scenario: A\n    Given something\n\nFeature: Two\n',
    );
    const {code, stdout} = await cli(['stats', '.'], cwd);
    assert.equal(code, 0, 'statistics describe files rather than judging them');
    assert.match(stdout, /Could not be read/u);
  } finally {
    fs.rmSync(cwd, {recursive: true, force: true});
  }
});

test('a directory with no feature files says so', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-stats-'));
  try {
    const {code, stdout} = await cli(['stats', '.'], cwd);
    assert.equal(code, 0);
    assert.match(stdout, /No feature files found\./u);
  } finally {
    fs.rmSync(cwd, {recursive: true, force: true});
  }
});

test('a format that does not exist is reported before anything is read', async () => {
  const {code, stdout, stderr} = await cli(['stats', FIXTURES, '--format', 'yaml']);
  assert.equal(code, 2);
  assert.equal(stdout, '');
  assert.match(stderr, /Unsupported format "yaml"/u);
});

test('a format borrowed from the object prototype is refused', async () => {
  const {code, stderr} = await cli(['stats', FIXTURES, '--format', 'constructor']);
  assert.equal(code, 2);
  assert.match(stderr, /Unsupported format "constructor"/u);
});

test('--top has to be a whole number of at least one', async () => {
  for (const value of ['0', 'ten', '2.5']) {
    const {code, stderr} = await cli(['stats', FIXTURES, '--top', value]);
    assert.equal(code, 2, `--top ${value} should not be accepted`);
    assert.match(stderr, /--top needs a whole number/u);
  }
});

test('a language that is not a dialect is reported', async () => {
  const {code, stderr} = await cli(['stats', FIXTURES, '--language', 'klingon']);
  assert.equal(code, 2);
  assert.match(stderr, /Unknown language "klingon"/u);
});

test('a path that names nothing is reported', async () => {
  const {code, stderr} = await cli(['stats', 'nowhere-at-all']);
  assert.equal(code, 2);
  assert.match(stderr, /"nowhere-at-all" does not exist/u);
});

test('--ignore leaves files out of the count', async () => {
  const {stdout} = await cli(['stats', FIXTURES, '--ignore', '**/Einkauf.feature', '-f', 'json']);
  const report = JSON.parse(stdout);
  assert.equal(report.inventory.features, 2);
  assert.deepEqual(report.languages, [{code: 'en', files: 2}]);
});

test('stats reads files in the language the configuration sets', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-stats-language-'));
  try {
    fs.writeFileSync(
      path.join(cwd, 'deconnexion.feature'),
      'Fonctionnalité: Se déconnecter\n\n  Scénario: Se déconnecter\n    Quand Ulrick se déconnecte\n',
    );
    // A rule stats knows nothing about must not stop it reading the language.
    fs.writeFileSync(path.join(cwd, 'team.json'), '{"language": "fr", "my-custom-rule": "on"}');
    fs.writeFileSync(path.join(cwd, '.gurkencheckrc'), '{"extends": "./team.json"}');

    const {code, stdout} = await cli(['stats', '.'], cwd);
    assert.equal(code, 0);
    assert.match(stdout, /^1 file, 1 feature/mu);

    fs.rmSync(path.join(cwd, '.gurkencheckrc'));
    const configured = await cli(['stats', '-c', 'team.json', '.'], cwd);
    assert.match(configured.stdout, /^1 file, 1 feature/mu);

    const missing = await cli(['stats', '-c', 'nowhere.json', '.'], cwd);
    assert.equal(missing.code, 2);
    assert.match(missing.stderr, /Could not find specified config file "nowhere\.json"/u);
  } finally {
    fs.rmSync(cwd, {recursive: true, force: true});
  }
});

test('--top takes plain digits only', async () => {
  for (const top of ['0x2', '1e3', ' 3']) {
    const {code, stderr} = await cli(['stats', FIXTURES, `--top=${top}`]);
    assert.equal(code, 2, top);
    assert.match(stderr, /--top needs a whole number/u, top);
  }
});

test('--top too large to count exactly is said to be too large', async () => {
  const {code, stderr} = await cli(['stats', FIXTURES, '--top=9007199254740993']);
  assert.equal(code, 2);
  assert.match(stderr, /--top can be at most 9007199254740991, not "9007199254740993"/u);
});

test('stats refuses a configuration it cannot read, rather than reading in English', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-stats-config-'));
  try {
    fs.writeFileSync(path.join(cwd, 'a.feature'), 'Fonctionnalité: A\n');
    for (const config of ['{bad', '{"extends": "./missing.json"}', '{"language": 3}']) {
      fs.writeFileSync(path.join(cwd, '.gurkencheckrc'), config);
      const {code, stdout, stderr} = await cli(['stats', '.'], cwd);
      assert.equal(code, 2, config);
      assert.equal(stdout, '', config);
      assert.match(stderr, /Could not read config file "\.gurkencheckrc"/u, config);
    }
  } finally {
    fs.rmSync(cwd, {recursive: true, force: true});
  }
});

test('stats says so when a file named outright is skipped by an ignore pattern', async () => {
  const {stderr} = await cli(['stats', `${FIXTURES}/Shop.feature`, '--ignore', 'Shop.feature']);
  assert.match(stderr, /Skipped ".*Shop\.feature": it matches an ignore pattern/u);
});

test('stats -c on a symlink to nothing says what it is, as the linter does', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-stats-dangling-'));
  try {
    fs.writeFileSync(path.join(cwd, 'a.feature'), 'Feature: A\n');
    fs.symlinkSync('gone.json', path.join(cwd, 'team.json'));
    for (const args of [['stats', '-c', 'team.json', '.'], ['stats', '-c', 'team.json', '-l', 'en', '.']]) {
      const {code, stderr} = await cli(args, cwd);
      assert.equal(code, 2, args.join(' '));
      assert.match(stderr, /it is a symlink to gone\.json, which does not exist/u, args.join(' '));
    }
  } finally {
    fs.rmSync(cwd, {recursive: true, force: true});
  }
});
