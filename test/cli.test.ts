/**
 * End to end tests: the command line interface is run as a real process.
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

/** A working directory holding one feature file and a configuration. */
async function withProject(
  feature: string,
  config: string,
  body: (cwd: string) => Promise<void>,
): Promise<void> {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-cli-'));
  try {
    fs.writeFileSync(path.join(cwd, 'Example.feature'), feature);
    fs.writeFileSync(path.join(cwd, '.gurkencheckrc'), config);
    await body(cwd);
  } finally {
    fs.rmSync(cwd, {recursive: true, force: true});
  }
}

const CLEAN_FEATURE = 'Feature: A\n\n  Scenario: B\n    Given something\n';
const DIRTY_FEATURE = 'Feature: A\n\n  Scenario: \n    Given something\n';
const CONFIG = '{"no-unnamed-scenarios": "on"}';

test('--help explains how to use the linter', async () => {
  const {code, stdout} = await cli(['--help']);
  assert.equal(code, 0);
  assert.match(stdout, /Usage: gurkencheck/u);
  assert.match(stdout, /--rulesdir/u);
});

test('--version prints the package version', async () => {
  const {code, stdout} = await cli(['--version']);
  assert.equal(code, 0);
  assert.match(stdout.trim(), /^\d+\.\d+\.\d+/u);
});

test('exits 0 when there is nothing to report', async () => {
  await withProject(CLEAN_FEATURE, CONFIG, async (cwd) => {
    const {code, stdout, stderr} = await cli(['.'], cwd);
    assert.equal(code, 0);
    assert.equal(stdout, '');
    assert.equal(stderr, '');
  });
});

test('exits 1 and prints the violation when a rule fails', async () => {
  await withProject(DIRTY_FEATURE, CONFIG, async (cwd) => {
    const {code, stdout} = await cli(['.'], cwd);
    assert.equal(code, 1);
    assert.match(stdout, /Missing Scenario name/u);
    assert.match(stdout, /no-unnamed-scenarios/u);
  });
});

test('finds the configuration file in the working directory', async () => {
  await withProject(DIRTY_FEATURE, CONFIG, async (cwd) => {
    const {code} = await cli([], cwd);
    assert.equal(code, 1);
  });
});

// https://github.com/gherkin-lint/gherkin-lint/issues/96
test('runs on the recommended rules when there is no configuration file', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-cli-'));
  try {
    fs.writeFileSync(path.join(cwd, 'Example.feature'), CLEAN_FEATURE);
    const clean = await cli(['.'], cwd);
    assert.equal(clean.code, 0, clean.stderr);

    // no-unnamed-scenarios is one of the recommended rules
    fs.writeFileSync(path.join(cwd, 'Example.feature'), DIRTY_FEATURE);
    const {code, stdout} = await cli(['.'], cwd);
    assert.equal(code, 1);
    assert.match(stdout, /Missing Scenario name/u);
  } finally {
    fs.rmSync(cwd, {recursive: true, force: true});
  }
});

test('exits 2 when a rule name is unknown', async () => {
  await withProject(CLEAN_FEATURE, '{"not-a-rule": "on"}', async (cwd) => {
    const {code, stderr} = await cli(['.'], cwd);
    assert.equal(code, 2);
    assert.match(stderr, /Rule "not-a-rule" does not exist/u);
  });
});



test('exits 2 for an unknown option', async () => {
  const {code, stderr} = await cli(['--nonsense']);
  assert.equal(code, 2);
  assert.match(stderr, /Usage: gurkencheck/u);
});

test('exits 2 for a path that names nothing', async () => {
  await withProject(CLEAN_FEATURE, CONFIG, async (cwd) => {
    const {code, stderr} = await cli(['badpattern**'], cwd);
    assert.equal(code, 2);
    assert.match(stderr, /Invalid format of the feature file path\/pattern/u);
  });
});

test('--format json prints machine readable output', async () => {
  await withProject(DIRTY_FEATURE, CONFIG, async (cwd) => {
    const {code, stdout} = await cli(['--format', 'json', '.'], cwd);
    assert.equal(code, 1);
    const results = JSON.parse(stdout) as {messages: {ruleId: string}[]}[];
    assert.equal(results[0]?.messages[0]?.ruleId, 'no-unnamed-scenarios');
  });
});

test('--ignore skips the files it matches', async () => {
  await withProject(DIRTY_FEATURE, CONFIG, async (cwd) => {
    const {code} = await cli(['--ignore', '**/Example.feature', '.'], cwd);
    assert.equal(code, 0);
  });
});

test('runs when invoked through a symlink, as npm installs it', async () => {
  // npm puts the command in node_modules/.bin as a symlink, so the check for
  // "am I the script being run" has to resolve links on both sides.
  const binDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-bin-'));
  const link = path.join(binDirectory, 'gurkencheck');
  try {
    fs.symlinkSync(CLI, link);
    const {stdout} = await run(process.execPath, [link, '--version']);
    assert.match(stdout.trim(), /^\d+\.\d+\.\d+/u);
  } finally {
    fs.rmSync(binDirectory, {recursive: true, force: true});
  }
});

// https://github.com/gherkin-lint/gherkin-lint/issues/340
// https://github.com/gherkin-lint/gherkin-lint/issues/21
test('a rule set to warn reports but exits 0', async () => {
  await withProject(DIRTY_FEATURE, '{"no-unnamed-scenarios": "warn"}', async (cwd) => {
    const {code, stdout} = await cli(['.'], cwd);
    assert.equal(code, 0);
    assert.match(stdout, /Missing Scenario name/u);
    assert.match(stdout, /warning/u);
  });
});

test('an error alongside a warning still exits 1', async () => {
  const config = '{"no-unnamed-scenarios": "warn", "no-files-without-scenarios": "on"}';
  await withProject('Feature: A\n\n  A description and nothing else.\n', config, async (cwd) => {
    const {code, stdout} = await cli(['.'], cwd);
    assert.equal(code, 1);
    assert.match(stdout, /error/u);
  });
});

// https://github.com/gherkin-lint/gherkin-lint/issues/80
test('findings can be redirected without dragging diagnostics along', async () => {
  await withProject(DIRTY_FEATURE, CONFIG, async (cwd) => {
    const {stdout, stderr} = await cli(['.'], cwd);
    assert.match(stdout, /Missing Scenario name/u);
    assert.equal(stderr, '', 'nothing on stderr when the linter ran fine');
  });
});

test('a problem that stops the linter still goes to stderr', async () => {
  await withProject(CLEAN_FEATURE, '{"not-a-rule": "on"}', async (cwd) => {
    const {stdout, stderr} = await cli(['.'], cwd);
    assert.equal(stdout, '');
    assert.match(stderr, /does not exist/u);
  });
});

// https://github.com/gherkin-lint/gherkin-lint/issues/114
test('--format accepts a path to a formatter of your own', async () => {
  await withProject(DIRTY_FEATURE, CONFIG, async (cwd) => {
    const formatter = path.join(cwd, 'count.mjs');
    fs.writeFileSync(
      formatter,
      'export default (results) =>\n' +
        '  `${results.reduce((n, r) => n + r.errors.length, 0)} findings`;\n',
    );
    const {code, stdout} = await cli(['--format', './count.mjs', '.'], cwd);
    assert.equal(code, 1);
    assert.equal(stdout.trim(), '1 findings');
  });
});

test('an unknown format names the built-ins and mentions custom ones', async () => {
  const {code, stderr} = await cli(['--format', 'yaml', '.']);
  assert.equal(code, 2);
  assert.match(stderr, /Unsupported format "yaml"/u);
  assert.match(stderr, /formatter of your own/u);
});

// https://github.com/gherkin-lint/gherkin-lint/issues/265
const FRENCH_FEATURE = [
  "Fonctionnalité: Se déconnecter de l'application",
  '',
  '  Scénario: Se déconnecter',
  '    Quand Ulrick se déconnecte',
  '',
].join('\n');

test('--language reads files that carry no language header', async () => {
  await withProject(FRENCH_FEATURE, '{"no-unnamed-scenarios": "on"}', async (cwd) => {
    const withoutLanguage = await cli(['.'], cwd);
    assert.equal(withoutLanguage.code, 1);
    assert.match(withoutLanguage.stdout, /unexpected-error/u);

    const {code, stdout} = await cli(['--language', 'fr', '.'], cwd);
    assert.equal(code, 0, stdout);
  });
});

test('the language may be set in the configuration file', async () => {
  const config = '{"language": "fr", "no-unnamed-scenarios": "on"}';
  await withProject(FRENCH_FEATURE, config, async (cwd) => {
    const {code, stdout} = await cli(['.'], cwd);
    assert.equal(code, 0, stdout);
  });
});

test('an unknown language is reported rather than silently ignored', async () => {
  await withProject(FRENCH_FEATURE, CONFIG, async (cwd) => {
    const {code, stderr} = await cli(['--language', 'klingon', '.'], cwd);
    assert.equal(code, 2);
    assert.match(stderr, /Unknown language "klingon"/u);
  });
});
