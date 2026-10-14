/**
 * End to end tests: the command line interface is run as a real process.
 */
import assert from 'node:assert/strict';
import {execFile, spawn} from 'node:child_process';
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
  assert.match(stderr, /Unknown option "--nonsense"/u);
  assert.match(stderr, /Run "gurkencheck --help" to see the options/u);
  assert.doesNotMatch(stderr, /Usage: gurkencheck/u);
});

test('exits 2 for a path that names nothing', async () => {
  await withProject(CLEAN_FEATURE, CONFIG, async (cwd) => {
    const {code, stderr} = await cli(['no-such-directory'], cwd);
    assert.equal(code, 2);
    assert.match(stderr, /"no-such-directory" does not exist/u);
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

test('--ignore given twice skips what either one matches', async () => {
  await withProject(DIRTY_FEATURE, CONFIG, async (cwd) => {
    fs.writeFileSync(path.join(cwd, 'Second.feature'), DIRTY_FEATURE);
    fs.writeFileSync(path.join(cwd, 'Clean.feature'), CLEAN_FEATURE);
    const {code} = await cli(['-i', 'Example.feature', '-i', 'Second.feature', '.'], cwd);
    assert.equal(code, 0);
  });
});

test('--ignore skips the files it matches', async () => {
  await withProject(DIRTY_FEATURE, CONFIG, async (cwd) => {
    fs.writeFileSync(path.join(cwd, 'Clean.feature'), CLEAN_FEATURE);
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

test('an unreadable file is reported cleanly, without a stack trace', async () => {
  await withProject(CLEAN_FEATURE, CONFIG, async (cwd) => {
    const unreadable = path.join(cwd, 'Unreadable.feature');
    fs.writeFileSync(unreadable, CLEAN_FEATURE);
    fs.chmodSync(unreadable, 0o000);
    try {
      // Running as root defeats the permission bits, so there is nothing to test.
      try {
        fs.readFileSync(unreadable, 'utf8');
        return;
      } catch {
        // Good: it really is unreadable.
      }

      const {code, stdout, stderr} = await cli(['.'], cwd);
      assert.equal(code, 1, 'an unreadable file is a finding, so the run fails');
      assert.match(stdout, /unexpected-error/u);
      assert.doesNotMatch(stderr, /at async/u, 'a stack trace should never reach the user');
    } finally {
      fs.chmodSync(unreadable, 0o644);
    }
  });
});

test('a formatter that throws exits 2 rather than crashing', async () => {
  await withProject(DIRTY_FEATURE, CONFIG, async (cwd) => {
    const formatter = path.join(cwd, 'broken-formatter.mjs');
    fs.writeFileSync(
      formatter,
      'export default function () {\n  throw new Error("formatter is broken");\n}\n',
    );

    const {code, stderr} = await cli(['--format', './broken-formatter.mjs', '.'], cwd);
    assert.equal(code, 2, 'a broken formatter is a usage problem, not a finding');
    assert.match(stderr, /The formatter failed: formatter is broken/u);
    assert.doesNotMatch(stderr, /at async/u, 'a stack trace should never reach the user');
  });
});

test('a config and a formatter may come from packages that only export for import', async () => {
  await withProject(DIRTY_FEATURE, '{"extends": "esm-config"}', async (cwd) => {
    const write = (name: string, source: string): void => {
      const directory = path.join(cwd, 'node_modules', name);
      fs.mkdirSync(directory, {recursive: true});
      fs.writeFileSync(
        path.join(directory, 'package.json'),
        JSON.stringify({name, type: 'module', exports: {import: './index.js'}}),
      );
      fs.writeFileSync(path.join(directory, 'index.js'), source);
    };
    write('esm-config', 'export default {"no-unnamed-scenarios": "on"};\n');
    write(
      'esm-formatter',
      'export default (results) => `${results[0].errors.length} finding`;\n',
    );

    const {code, stdout, stderr} = await cli(['--format', 'esm-formatter', '.'], cwd);
    assert.equal(stderr, '');
    assert.equal(stdout.trim(), '1 finding');
    assert.equal(code, 1);
  });
});

test('a config extending a package that throws on import exits 2 with the reason', async () => {
  await withProject(CLEAN_FEATURE, '{"extends": "broken-config"}', async (cwd) => {
    const packageDirectory = path.join(cwd, 'node_modules', 'broken-config');
    fs.mkdirSync(packageDirectory, {recursive: true});
    fs.writeFileSync(
      path.join(packageDirectory, 'package.json'),
      '{"name": "broken-config", "version": "1.0.0", "main": "index.js"}',
    );
    fs.writeFileSync(
      path.join(packageDirectory, 'index.js'),
      'throw new Error("config module is broken");\n',
    );

    const {code, stderr} = await cli(['.'], cwd);
    assert.equal(code, 2);
    assert.match(stderr, /config module is broken/u);
    assert.doesNotMatch(stderr, /at async/u, 'a stack trace should never reach the user');
  });
});

/**
 * Interrupts a watching process and waits for it to go.
 *
 * With a deadline, and SIGKILL behind it: a process that will not stop is a
 * failure worth seeing, not a run that never finishes.
 */
async function stop(child: ReturnType<typeof spawn>): Promise<number | null> {
  child.kill('SIGINT');

  const exited = new Promise<number | null>((resolve) => {
    child.on('exit', (code) => resolve(code));
  });
  const gaveUp = new Promise<'timeout'>((resolve) => {
    setTimeout(() => resolve('timeout'), 10000).unref();
  });

  const outcome = await Promise.race([exited, gaveUp]);
  if (outcome === 'timeout') {
    child.kill('SIGKILL');
    await exited;
    assert.fail('the watching process did not stop when it was interrupted');
  }
  return outcome;
}

test('--help mentions watching', async () => {
  const {code, stdout} = await cli(['--help']);
  assert.equal(code, 0);
  assert.match(stdout, /--watch/u);
});

test('--watch checks, waits, then checks again when a file changes', async () => {
  await withProject(DIRTY_FEATURE, CONFIG, async (cwd) => {
    const child = spawn(process.execPath, [CLI, '--watch', '.'], {cwd});
    let output = '';
    child.stdout.on('data', (chunk) => (output += String(chunk)));
    child.stderr.on('data', (chunk) => (output += String(chunk)));

    /** Waits for the output to say something, rather than for a fixed time. */
    const waitFor = async (pattern: RegExp): Promise<void> => {
      const deadline = Date.now() + 10000;
      while (!pattern.test(output)) {
        if (Date.now() > deadline) {
          assert.fail(`timed out waiting for ${String(pattern)} in:\n${output}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    };

    try {
      await waitFor(/Missing Scenario name/u);
      await waitFor(/Watching for changes/u);

      output = '';
      fs.writeFileSync(path.join(cwd, 'Example.feature'), CLEAN_FEATURE);
      await waitFor(/Example\.feature changed/u);
      // A clean pass says so, rather than looking like no pass at all.
      await waitFor(/No errors found/u);

      // A file that appears after the run started is noticed too, which is
      // why the watch is on the directory rather than on what it found.
      output = '';
      fs.writeFileSync(path.join(cwd, 'Second.feature'), DIRTY_FEATURE);
      await waitFor(/Second\.feature/u);
      await waitFor(/Missing Scenario name/u);
    } finally {
      await stop(child);
    }
  });
});

test('--watch reads the configuration again when it changes', async () => {
  await withProject(DIRTY_FEATURE, CONFIG, async (cwd) => {
    const child = spawn(process.execPath, [CLI, '--watch', '.'], {cwd});
    let output = '';
    child.stdout.on('data', (chunk) => (output += String(chunk)));
    child.stderr.on('data', (chunk) => (output += String(chunk)));

    const waitFor = async (pattern: RegExp): Promise<void> => {
      const deadline = Date.now() + 10000;
      while (!pattern.test(output)) {
        if (Date.now() > deadline) {
          assert.fail(`timed out waiting for ${String(pattern)} in:\n${output}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    };

    try {
      await waitFor(/error +Missing Scenario name/u);
      await waitFor(/Watching for changes/u);

      output = '';
      fs.writeFileSync(path.join(cwd, '.gurkencheckrc'), '{"no-unnamed-scenarios": "warn"}');
      await waitFor(/warning +Missing Scenario name/u);
    } finally {
      await stop(child);
    }
  });
});

test('--watch exits 0 when it is stopped', async () => {
  await withProject(DIRTY_FEATURE, CONFIG, async (cwd) => {
    const child = spawn(process.execPath, [CLI, '--watch', '.'], {cwd});
    let output = '';
    child.stderr.on('data', (chunk) => (output += String(chunk)));

    const deadline = Date.now() + 10000;
    while (!/Watching for changes/u.test(output)) {
      if (Date.now() > deadline) assert.fail(`timed out, saw:\n${output}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    // A run that found something is the normal state of affairs while you are
    // fixing it, so stopping the watch is not itself a failure.
    assert.equal(await stop(child), 0);
  });
});

test('stops quietly when whoever reads the output goes away', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-cli-'));
  try {
    // Enough output to fill the pipe several times over.
    for (let index = 0; index < 400; index++) {
      fs.writeFileSync(path.join(cwd, `f${index}.feature`), DIRTY_FEATURE);
    }
    fs.writeFileSync(path.join(cwd, '.gurkencheckrc'), CONFIG);

    const child = spawn(process.execPath, [CLI, '.'], {cwd});
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += String(chunk)));
    // Read one chunk, then hang up, as `| head -1` does.
    child.stdout.once('data', () => child.stdout.destroy());
    const code = await new Promise<number | null>((resolve) => child.on('exit', resolve));

    assert.equal(stderr, '');
    // The run goes on to its end, so the code says what it found.
    assert.equal(code, 1);
  } finally {
    fs.rmSync(cwd, {recursive: true, force: true});
  }
});

test('says so when a file named outright is skipped by an ignore pattern', async () => {
  await withProject(DIRTY_FEATURE, CONFIG, async (cwd) => {
    const {code, stdout, stderr} = await cli(['--ignore', 'Example.feature', 'Example.feature'], cwd);
    assert.equal(code, 0);
    assert.equal(stdout, '');
    assert.match(stderr, /Skipped "Example\.feature": it matches an ignore pattern/u);
  });
});

test('says so when a rule from --rulesdir named like a property of every object is not switched on', async () => {
  await withProject(CLEAN_FEATURE, CONFIG, async (cwd) => {
    const {stderr} = await cli(['--rulesdir', path.resolve('test/rulesdir/prototype_rules'), '.'], cwd);
    assert.match(stderr, /The rule "toString" from --rulesdir is not in the configuration/u);
  });
});

test('says so when a rule from --rulesdir is not switched on', async () => {
  const rulesDir = path.resolve('test/rulesdir/rules');
  await withProject(CLEAN_FEATURE, CONFIG, async (cwd) => {
    const {code, stderr} = await cli(['--rulesdir', rulesDir, '.'], cwd);
    assert.equal(code, 0);
    assert.match(stderr, /The rule "custom" from --rulesdir is not in the configuration/u);
  });
  for (const state of ['on', 'off']) {
    await withProject(CLEAN_FEATURE, `{"custom": "${state}"}`, async (cwd) => {
      const {stderr} = await cli(['--rulesdir', rulesDir, '.'], cwd);
      assert.doesNotMatch(stderr, /not in the configuration/u, state);
    });
  }
});

test('finds the configuration in a directory above the working directory', async () => {
  await withProject(DIRTY_FEATURE, '{"no-unnamed-scenarios": "warn"}', async (cwd) => {
    const subdirectory = path.join(cwd, 'features', 'deep');
    fs.mkdirSync(subdirectory, {recursive: true});
    fs.renameSync(path.join(cwd, 'Example.feature'), path.join(subdirectory, 'Example.feature'));

    // Set to warn above, an error under the recommended preset.
    const {code, stdout} = await cli(['.'], subdirectory);
    assert.equal(code, 0);
    assert.match(stdout, /warning +Missing Scenario name/u);
  });
});

test('a streaming formatter may be async', async () => {
  const formatter = path.resolve('test/formatters/async-streaming.mjs');
  await withProject(DIRTY_FEATURE, CONFIG, async (cwd) => {
    const {code, stdout, stderr} = await cli(['-f', formatter, '.'], cwd);
    assert.equal(stderr, '');
    assert.equal(stdout, 'start|Example.feature|end\n');
    assert.equal(code, 1);
  });
});

test('a streaming formatter handing back something other than text is blamed', async () => {
  const formatter = path.resolve('test/formatters/bad-streaming.mjs');
  await withProject(DIRTY_FEATURE, CONFIG, async (cwd) => {
    const {code, stderr} = await cli(['-f', formatter, '.'], cwd);
    assert.equal(code, 2);
    assert.match(stderr, /The formatter failed: file\(\) returned number instead of a string/u);
  });
});

test('stats given after an option says to put it first', async () => {
  await withProject(CLEAN_FEATURE, CONFIG, async (cwd) => {
    const {code, stderr} = await cli(['-f', 'json', 'stats'], cwd);
    assert.equal(code, 2);
    assert.match(stderr, /To run the stats command, put stats first/u);
  });
});

test('a formatter returning something other than text is a failure, not silence', async () => {
  const formatter = path.resolve('test/formatters/returns-number.mjs');
  await withProject(CLEAN_FEATURE, CONFIG, async (cwd) => {
    const {code, stdout, stderr} = await cli(['-f', formatter, '.'], cwd);
    assert.equal(code, 2);
    assert.equal(stdout, '');
    assert.match(stderr, /The formatter failed: it returned number instead of a string/u);
  });
});

test('--watch carries on over a configuration it cannot read at the start', async () => {
  await withProject(DIRTY_FEATURE, '{bad', async (cwd) => {
    const child = spawn(process.execPath, [CLI, '--watch', '.'], {cwd});
    let output = '';
    child.stdout.on('data', (chunk) => (output += String(chunk)));
    child.stderr.on('data', (chunk) => (output += String(chunk)));
    const waitFor = async (pattern: RegExp, retry?: () => void): Promise<void> => {
      const deadline = Date.now() + 10000;
      let nextRetry = 0;
      while (!pattern.test(output)) {
        if (Date.now() > deadline) assert.fail(`timed out waiting for ${String(pattern)} in:\n${output}`);
        if (retry !== undefined && Date.now() >= nextRetry) {
          retry();
          nextRetry = Date.now() + 250;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    };
    try {
      await waitFor(/Could not read config file/u);
      await waitFor(/Watching for changes/u);
      await waitFor(/error +Missing Scenario name/u, () =>
        fs.writeFileSync(path.join(cwd, '.gurkencheckrc'), CONFIG),
      );
    } finally {
      await stop(child);
    }
  });
});

test('the README extends example accepts a conventionally laid out file', async () => {
  const readme = fs.readFileSync('README.md', 'utf8');
  const example = /```jsonc\n(\{\n {2}"extends": "gurkencheck:recommended",[\s\S]*?)```/u.exec(readme)?.[1];
  assert.ok(example !== undefined, 'the README should hold the extends example');
  await withProject(CLEAN_FEATURE, example, async (cwd) => {
    const {code, stdout} = await cli(['.'], cwd);
    assert.equal(stdout, '');
    assert.equal(code, 0);
  });
});

test('a directory that cannot be read is reported, not passed over', async () => {
  if (process.platform === 'win32' || process.getuid?.() === 0) return;
  await withProject(CLEAN_FEATURE, CONFIG, async (cwd) => {
    const locked = path.join(cwd, 'locked');
    fs.mkdirSync(locked);
    fs.writeFileSync(path.join(locked, 'a.feature'), DIRTY_FEATURE);
    fs.chmodSync(locked, 0o000);
    try {
      for (const args of [['locked'], ['.'], ['stats', '.']]) {
        const {code, stderr} = await cli(args, cwd);
        assert.equal(code, 2, args.join(' '));
        assert.match(stderr, /Could not read the directory "locked": permission denied/u, args.join(' '));
      }
    } finally {
      fs.chmodSync(locked, 0o755);
    }
  });
});

test('an empty configuration found by looking may be removed; one given with -c is not advised so', async () => {
  await withProject(CLEAN_FEATURE, '', async (cwd) => {
    const found = await cli(['.'], cwd);
    assert.match(found.stderr, /or remove it to use the recommended rules/u);
    fs.writeFileSync(path.join(cwd, 'given.json'), '');
    const given = await cli(['-c', 'given.json', '.'], cwd);
    assert.doesNotMatch(given.stderr, /remove it/u);
    assert.match(given.stderr, /"given\.json" is empty/u);
  });
});

test('a streaming hook handing back null writes nothing, from any hook', async () => {
  const formatter = path.resolve('test/formatters/null-hooks.mjs');
  await withProject(DIRTY_FEATURE, CONFIG, async (cwd) => {
    const {code, stdout, stderr} = await cli(['-f', formatter, '.'], cwd);
    assert.equal(stderr, '');
    assert.equal(stdout, 'x\n');
    assert.equal(code, 1);
  });
});

test('a streaming formatter is handed the run s rules as well', async () => {
  const formatter = path.resolve('test/formatters/context-streaming.mjs');
  await withProject(CLEAN_FEATURE, CONFIG, async (cwd) => {
    const {stdout} = await cli(['-f', formatter, '.'], cwd);
    assert.match(stdout, /^rules: \d+\n$/u);
  });
});

test('--watch counts the warnings into its no-errors notice', async () => {
  await withProject(DIRTY_FEATURE, '{"no-unnamed-scenarios": "warn"}', async (cwd) => {
    const child = spawn(process.execPath, [CLI, '--watch', '.'], {cwd});
    let output = '';
    child.stdout.on('data', (chunk) => (output += String(chunk)));
    child.stderr.on('data', (chunk) => (output += String(chunk)));
    try {
      const deadline = Date.now() + 10000;
      while (!/Watching for changes/u.test(output)) {
        if (Date.now() > deadline) assert.fail(`timed out, saw:\n${output}`);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.match(output, /No errors found, 1 warning\./u);
    } finally {
      await stop(child);
    }
  });
});

test('a path or glob that matches no feature files is an error, not a clean run', async () => {
  await withProject(CLEAN_FEATURE, CONFIG, async (cwd) => {
    fs.mkdirSync(path.join(cwd, 'empty'));
    for (const [args, message] of [
      [['featurs/*'], /"featurs\/\*" matched no feature files/u],
      [['nomatch/**'], /"nomatch\/\*\*" matched no feature files/u],
      [['empty'], /"empty" matched no feature files/u],
      [['-i', 'Example.feature', '.'], /Every feature file "\." matched is skipped by an ignore pattern/u],
    ] as const) {
      const {code, stderr} = await cli([...args], cwd);
      assert.equal(code, 2, args.join(' '));
      assert.match(stderr, message, args.join(' '));
    }
    // A pattern whose files another one already found did match something.
    const overlapping = await cli(['.', 'Example.feature'], cwd);
    assert.equal(overlapping.code, 0, overlapping.stderr);
  });
});

test('no feature files anywhere below the working directory is an error', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-none-'));
  try {
    const {code, stderr} = await cli([], cwd);
    assert.equal(code, 2);
    assert.match(stderr, /No feature files found in the working directory or below/u);
  } finally {
    fs.rmSync(cwd, {recursive: true, force: true});
  }
});

test('a run whose reader goes away at once still exits with what it found', async () => {
  await withProject(DIRTY_FEATURE, CONFIG, async (cwd) => {
    for (const format of ['stylish', 'tap']) {
      const child = spawn(process.execPath, [CLI, '-f', format, '.'], {cwd});
      child.stdout.destroy();
      const code = await new Promise<number | null>((resolve) => child.on('exit', resolve));
      assert.equal(code, 1, format);
    }
  });
});

test('a file whose name reads as an option is refused, not obeyed', async () => {
  await withProject(DIRTY_FEATURE, CONFIG, async (cwd) => {
    fs.writeFileSync(path.join(cwd, '--ignore=**'), '');
    for (const args of [['--ignore=**', 'Example.feature'], ['stats', '--ignore=**', 'Example.feature']]) {
      const {code, stderr} = await cli(args, cwd);
      assert.equal(code, 2, args.join(' '));
      assert.match(stderr, /"--ignore=\*\*" is a file, but reads as an option\. Put file names after --/u, args.join(' '));
    }
    // After --, it is a name like any other.
    const named = await cli(['--', 'Example.feature'], cwd);
    assert.equal(named.code, 1);
  });
});

test('--watch notices the fix to an extended file it was told is broken', async () => {
  await withProject(DIRTY_FEATURE, '{"extends": "./team.json"}', async (cwd) => {
    const team = path.join(cwd, 'team.json');
    fs.writeFileSync(team, CONFIG);
    const child = spawn(process.execPath, [CLI, '--watch', '.'], {cwd});
    let output = '';
    child.stdout.on('data', (chunk) => (output += String(chunk)));
    child.stderr.on('data', (chunk) => (output += String(chunk)));
    const waitFor = async (pattern: RegExp, retry?: () => void): Promise<void> => {
      const deadline = Date.now() + 10000;
      let nextRetry = 0;
      while (!pattern.test(output)) {
        if (Date.now() > deadline) assert.fail(`timed out waiting for ${String(pattern)} in:\n${output}`);
        if (retry !== undefined && Date.now() >= nextRetry) {
          retry();
          nextRetry = Date.now() + 300;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    };
    try {
      await waitFor(/Watching for changes/u);
      output = '';
      await waitFor(/Could not parse/u, () => fs.writeFileSync(team, '{broken'));
      output = '';
      await waitFor(/error +Missing Scenario name/u, () => fs.writeFileSync(team, CONFIG));
    } finally {
      await stop(child);
    }
  });
});

test('a failure outside the run, in plugin code, is a failure to run, not a finding', async () => {
  await withProject(CLEAN_FEATURE, '{"stray": "on"}', async (cwd) => {
    const {code, stderr} = await cli(['--rulesdir', path.resolve('test/rulesdir/stray_rules'), '.'], cwd);
    assert.equal(code, 2);
    assert.match(stderr, /Something failed outside the run, most likely in a custom rule or formatter: nobody was waiting/u);
  });
});

test('a rule or formatter whose promise never settles is named, and the run fails to run', async () => {
  await withProject(CLEAN_FEATURE, '{"hang": "on"}', async (cwd) => {
    const {code, stderr} = await cli(['--rulesdir', path.resolve('test/rulesdir/hanging_rules'), '.'], cwd);
    assert.equal(code, 2);
    assert.match(stderr, /The run never finished: the rule "hang" returned a promise that never settles/u);
    assert.doesNotMatch(stderr, /unsettled top-level await/u);
  });
  await withProject(CLEAN_FEATURE, CONFIG, async (cwd) => {
    const plain = await cli(['-f', path.resolve('test/formatters/hanging.mjs'), '.'], cwd);
    assert.equal(plain.code, 2);
    assert.match(plain.stderr, /the formatter returned a promise that never settles/u);
    const streaming = await cli(['-f', path.resolve('test/formatters/hanging-streaming.mjs'), '.'], cwd);
    assert.equal(streaming.code, 2);
    assert.match(streaming.stderr, /the formatter's end\(\) returned a promise that never settles/u);
  });
});

test('a rule or formatter throwing something that is not text is still named', async () => {
  await withProject(DIRTY_FEATURE, '{"textless": "on", "no-unnamed-scenarios": "on"}', async (cwd) => {
    const {code, stdout} = await cli(['--rulesdir', path.resolve('test/rulesdir/textless_rules'), '.'], cwd);
    assert.equal(code, 1);
    assert.match(stdout, /Rule "textless" failed: a value that cannot be shown as text/u);
    assert.match(stdout, /no-unnamed-scenarios/u, 'the other findings are kept');
  });
  await withProject(CLEAN_FEATURE, CONFIG, async (cwd) => {
    const {code, stderr} = await cli(['-f', path.resolve('test/formatters/throws-textless.mjs'), '.'], cwd);
    assert.equal(code, 2);
    assert.match(stderr, /The formatter failed: a value that cannot be shown as text/u);
    assert.doesNotMatch(stderr, /stopped unexpectedly/u);
  });
});

test('a formatter emptying the results it prints does not change the verdict', async () => {
  const formatter = path.resolve('test/formatters/emptying.mjs');
  await withProject(DIRTY_FEATURE, CONFIG, async (cwd) => {
    const {code, stdout} = await cli(['-f', formatter, '.'], cwd);
    assert.match(stdout, /1 findings/u);
    assert.equal(code, 1);
  });
});

test('a streaming formatter pruning the rules it is handed does not stop them running', async () => {
  const formatter = path.resolve('test/formatters/pruning-streaming.mjs');
  await withProject(DIRTY_FEATURE, CONFIG, async (cwd) => {
    const {code} = await cli(['-f', formatter, '.'], cwd);
    assert.equal(code, 1);
  });
});

test('a run that could not search what it was asked writes no report', async () => {
  await withProject(CLEAN_FEATURE, CONFIG, async (cwd) => {
    for (const format of ['sarif', 'junit', 'json', 'tap', 'stylish']) {
      const {code, stdout, stderr} = await cli(['-f', format, 'nothing/*'], cwd);
      assert.equal(code, 2, format);
      assert.equal(stdout, '', format);
      assert.match(stderr, /matched no feature files/u, format);
    }
  });
});

test('piped, one long message does not pad every other one to its length', async () => {
  // use-and quotes the step it is about, so its message is as long as the step.
  const long = `Given ${'a'.repeat(5000)}`;
  const feature = `Feature: A\n\n  Scenario:\n    Given a\n    ${long}\n  Scenario:\n    Given b\n`;
  await withProject(feature, '{"no-unnamed-scenarios": "on", "use-and": "on"}', async (cwd) => {
    const {stdout} = await cli(['.'], cwd);
    const short = stdout.split('\n').filter((line) => line.includes('Missing Scenario name'));
    assert.ok(short.length > 0);
    for (const line of short) {
      assert.ok(line.length < 200, `padded to ${line.length}`);
    }
  });
});

test('a directory the ignore patterns skip is not walked, so one inside it that cannot be read does not matter', async () => {
  if (process.platform === 'win32' || process.getuid?.() === 0) return;
  await withProject(CLEAN_FEATURE, CONFIG, async (cwd) => {
    const locked = path.join(cwd, 'node_modules', 'pkg', 'locked');
    fs.mkdirSync(locked, {recursive: true});
    fs.chmodSync(locked, 0o000);
    try {
      const {code, stderr} = await cli(['.'], cwd);
      assert.equal(stderr, '');
      assert.equal(code, 0);
    } finally {
      fs.chmodSync(locked, 0o755);
    }
  });
});

test('--watch says a watched path is gone, rather than that it has no errors', async () => {
  await withProject(DIRTY_FEATURE, CONFIG, async (cwd) => {
    const child = spawn(process.execPath, [CLI, '--watch', 'Example.feature'], {cwd});
    let output = '';
    child.stdout.on('data', (chunk) => (output += String(chunk)));
    child.stderr.on('data', (chunk) => (output += String(chunk)));
    const waitFor = async (pattern: RegExp): Promise<void> => {
      const deadline = Date.now() + 10000;
      while (!pattern.test(output)) {
        if (Date.now() > deadline) assert.fail(`timed out waiting for ${String(pattern)} in:\n${output}`);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    };
    try {
      await waitFor(/Watching for changes/u);
      output = '';
      fs.rmSync(path.join(cwd, 'Example.feature'));
      await waitFor(/"Example\.feature" does not exist/u);
      assert.doesNotMatch(output, /No errors found/u);
    } finally {
      await stop(child);
    }
  });
});

test('--watch passes over a feature file outside its glob, rather than calling it clean', async () => {
  await withProject(CLEAN_FEATURE, CONFIG, async (cwd) => {
    fs.mkdirSync(path.join(cwd, 'sub'));
    fs.writeFileSync(path.join(cwd, 'sub', 's.feature'), CLEAN_FEATURE);
    const child = spawn(process.execPath, [CLI, '--watch', '*.feature'], {cwd});
    let output = '';
    child.stdout.on('data', (chunk) => (output += String(chunk)));
    child.stderr.on('data', (chunk) => (output += String(chunk)));
    const waitFor = async (pattern: RegExp): Promise<void> => {
      const deadline = Date.now() + 10000;
      while (!pattern.test(output)) {
        if (Date.now() > deadline) assert.fail(`timed out waiting for ${String(pattern)} in:\n${output}`);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    };
    try {
      await waitFor(/Watching for changes/u);
      output = '';
      fs.writeFileSync(path.join(cwd, 'sub', 's.feature'), DIRTY_FEATURE);
      await new Promise((resolve) => setTimeout(resolve, 500));
      assert.doesNotMatch(output, /s\.feature changed/u);
      // A new file the glob takes in is still a change.
      fs.writeFileSync(path.join(cwd, 'New.feature'), DIRTY_FEATURE);
      await waitFor(/Missing Scenario name|unnamed/u);
      assert.match(output, /New\.feature changed/u);
    } finally {
      await stop(child);
    }
  });
});

test('--watch notices a closer configuration being written', async () => {
  await withProject(CLEAN_FEATURE, CONFIG, async (cwd) => {
    const sub = path.join(cwd, 'sub');
    fs.mkdirSync(path.join(sub, 'features'), {recursive: true});
    fs.writeFileSync(path.join(sub, 'features', 'x.feature'), DIRTY_FEATURE);
    const child = spawn(process.execPath, [CLI, '--watch', 'features'], {cwd: sub});
    let output = '';
    child.stdout.on('data', (chunk) => (output += String(chunk)));
    child.stderr.on('data', (chunk) => (output += String(chunk)));
    const waitFor = async (pattern: RegExp): Promise<void> => {
      const deadline = Date.now() + 10000;
      while (!pattern.test(output)) {
        if (Date.now() > deadline) assert.fail(`timed out waiting for ${String(pattern)} in:\n${output}`);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    };
    try {
      await waitFor(/Watching for changes/u);
      assert.match(output, /no-unnamed-scenarios/u);
      output = '';
      fs.writeFileSync(path.join(sub, '.gurkencheckrc'), '{}');
      await waitFor(/No errors found/u);
      assert.match(output, /\.gurkencheckrc changed/u);
    } finally {
      await stop(child);
    }
  });
});

test('--ignore takes a brace pattern whole, commas and all', async () => {
  await withProject(CLEAN_FEATURE, CONFIG, async (cwd) => {
    for (const directory of ['wip', 'legacy']) {
      fs.mkdirSync(path.join(cwd, directory));
      fs.writeFileSync(path.join(cwd, directory, 'x.feature'), DIRTY_FEATURE);
    }
    const {code, stdout} = await cli(['-i', '{wip,legacy}', '.'], cwd);
    assert.equal(code, 0, stdout);
  });
});

test('a directory named outright and skipped whole is a run that checked nothing', async () => {
  await withProject(CLEAN_FEATURE, CONFIG, async (cwd) => {
    fs.mkdirSync(path.join(cwd, 'legacy'));
    fs.writeFileSync(path.join(cwd, 'legacy', 'old.feature'), DIRTY_FEATURE);
    const {code, stderr} = await cli(['-i', 'legacy', 'legacy'], cwd);
    assert.equal(code, 2);
    assert.match(stderr, /Every feature file "legacy" matched is skipped by an ignore pattern/u);
  });
});

test('an ignore file that cannot be read is an error, not passed over', async () => {
  if (process.platform === 'win32' || process.getuid?.() === 0) return;
  await withProject(CLEAN_FEATURE, CONFIG, async (cwd) => {
    const ignoreFile = path.join(cwd, '.gurkencheckignore');
    fs.writeFileSync(ignoreFile, 'legacy\n');
    fs.chmodSync(ignoreFile, 0o000);
    try {
      for (const args of [['.'], ['stats', '.']]) {
        const {code, stderr} = await cli(args, cwd);
        assert.equal(code, 2, args.join(' '));
        assert.match(stderr, /Could not read the ignore file "\.gurkencheckignore": permission denied/u, args.join(' '));
      }
    } finally {
      fs.chmodSync(ignoreFile, 0o644);
    }
  });
});
