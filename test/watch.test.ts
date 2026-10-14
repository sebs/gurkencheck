/**
 * Checking again when the files change.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {collectDiagnostics} from '../src/diagnostics.ts';
import {featureRoots} from '../src/feature-finder.ts';
import {isInteresting, watch} from '../src/watch.ts';

const CONFIG = '.gurkencheckrc';

/**
 * Waits for something to become true, rather than for a fixed time.
 *
 * `retry`, when given, is done at once and again every so often until then.
 * On macOS a watch can miss a write made in the moments after it started,
 * more so on a machine busy running the rest of the suite, so a test waiting
 * on a write repeats it rather than failing on a watch that simply had not
 * caught up yet.
 */
async function waitFor(
  what: string,
  condition: () => boolean,
  retry?: () => void,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let nextRetry = 0;
  while (!condition()) {
    if (Date.now() > deadline) {
      assert.fail(`timed out waiting for ${what}`);
    }
    if (retry !== undefined && Date.now() >= nextRetry) {
      retry();
      nextRetry = Date.now() + 250;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** A watched directory, stopped and cleaned up afterwards however it ends. */
async function withWatch(
  body: (context: {
    directory: string;
    passes: () => number;
    notices: () => string[];
  }) => Promise<void>,
): Promise<void> {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-watch-'));
  const controller = new AbortController();
  const diagnostics = collectDiagnostics();
  let passes = 0;

  const guard = setTimeout(() => controller.abort(), 20000);
  const stopped = watch(
    [directory],
    CONFIG,
    {diagnostics, settleMs: 10, signal: controller.signal},
    async () => {
      passes += 1;
    },
  );

  try {
    // The "watching" notice comes after the first pass, so waiting only for
    // the pass would let the body run before the watch had settled.
    await waitFor('the first pass', () => passes >= 1);
    await waitFor('the watch to settle', () =>
      diagnostics.reported.some((entry) => entry.message.includes('Watching for changes')),
    );
    await body({
      directory,
      passes: () => passes,
      notices: () => diagnostics.reported.map((entry) => entry.message),
    });
  } finally {
    clearTimeout(guard);
    controller.abort();
    await stopped;
    fs.rmSync(directory, {recursive: true, force: true});
  }
}

test('checks once before anything has changed', async () => {
  await withWatch(async ({passes}) => {
    assert.equal(passes(), 1);
  });
});

test('checks again when a feature file appears', async () => {
  await withWatch(async ({directory, passes}) => {
    await waitFor(
      'a second pass',
      () => passes() >= 2,
      () => fs.writeFileSync(path.join(directory, 'New.feature'), 'Feature: A\n'),
    );
  });
});

test('checks again when a feature file changes', async () => {
  await withWatch(async ({directory, passes}) => {
    const file = path.join(directory, 'Edited.feature');
    await waitFor('the pass for the new file', () => passes() >= 2, () => fs.writeFileSync(file, 'Feature: A\n'));

    const before = passes();
    await waitFor('the pass for the edit', () => passes() > before, () => fs.writeFileSync(file, 'Feature: B\n'));
  });
});

test('checks again when the configuration changes', async () => {
  await withWatch(async ({directory, passes}) => {
    await waitFor(
      'a pass for the configuration',
      () => passes() >= 2,
      () => fs.writeFileSync(path.join(directory, CONFIG), '{"no-unnamed-scenarios": "on"}'),
    );
  });
});

test('takes no notice of a file that is not a feature file', async () => {
  await withWatch(async ({directory, passes}) => {
    fs.writeFileSync(path.join(directory, 'notes.txt'), 'nothing to do with it');
    fs.writeFileSync(path.join(directory, 'script.js'), 'console.log(1)');
    // Give any event time to arrive and be ignored, then prove one that
    // matters still gets through - so this is not just a slow watch.
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(passes(), 1, 'a .txt and a .js should not have started a pass');

    await waitFor(
      'a pass for the feature file',
      () => passes() >= 2,
      () => fs.writeFileSync(path.join(directory, 'Real.feature'), 'Feature: A\n'),
    );
  });
});

test('a flurry of writes is one pass, not one each', async () => {
  await withWatch(async ({directory, passes}) => {
    for (let index = 0; index < 12; index++) {
      fs.writeFileSync(path.join(directory, `Burst${index}.feature`), 'Feature: A\n');
    }
    await waitFor('a pass for the burst', () => passes() >= 2);
    // Let anything still coming arrive.
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.ok(passes() <= 3, `12 writes should settle into a pass or two, saw ${passes() - 1}`);
  });
});

test('says what changed and that it is waiting', async () => {
  await withWatch(async ({directory, passes, notices}) => {
    assert.ok(
      notices().some((message) => message.includes('Watching for changes')),
      'it should say it is watching',
    );

    await waitFor(
      'a second pass',
      () => passes() >= 2,
      () => fs.writeFileSync(path.join(directory, 'Named.feature'), 'Feature: A\n'),
    );
    assert.ok(
      notices().some((message) => message.includes('Named.feature changed')),
      `it should name the file that changed, got: ${JSON.stringify(notices())}`,
    );
  });
});

test('a pass that throws does not stop the watch', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-watch-'));
  const controller = new AbortController();
  let passes = 0;

  const stopped = watch(
    [directory],
    CONFIG,
    {diagnostics: collectDiagnostics(), settleMs: 10, signal: controller.signal},
    async () => {
      passes += 1;
      // The first pass is the one during startup; fail a later one.
      if (passes === 2) {
        throw new Error('a formatter fell over');
      }
    },
  );

  try {
    await waitFor('the first pass', () => passes >= 1);
    await waitFor(
      'the failing pass',
      () => passes >= 2,
      () => fs.writeFileSync(path.join(directory, 'A.feature'), 'Feature: A\n'),
    );
    await waitFor(
      'a pass after the failure',
      () => passes >= 3,
      () => fs.writeFileSync(path.join(directory, 'B.feature'), 'Feature: B\n'),
    );
  } finally {
    controller.abort();
    await stopped;
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('stopping resolves, so the caller can exit tidily', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-watch-'));
  const controller = new AbortController();
  try {
    const stopped = watch(
      [directory],
      CONFIG,
      {diagnostics: collectDiagnostics(), settleMs: 10, signal: controller.signal},
      async () => undefined,
    );
    controller.abort();
    assert.equal(await stopped, 0);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

// This one used to hang the whole run on Linux. fs.watch throws on a missing
// directory on macOS and reports it later on Linux, so there the watcher was
// created, nothing was actually being watched, and the wait never ended.
// The signal is a safety net: if this ever waits again, it fails rather than
// hanging the suite.
test('a directory that cannot be watched is reported rather than waited on', async () => {
  const diagnostics = collectDiagnostics();
  const missing = path.join(os.tmpdir(), 'gurkencheck-watch-nowhere-at-all');
  const controller = new AbortController();
  const guard = setTimeout(() => controller.abort(), 5000);

  try {
    const code = await watch(
      [missing],
      CONFIG,
      {diagnostics, signal: controller.signal},
      async () => undefined,
    );

    assert.equal(code, 0);
    assert.ok(!controller.signal.aborted, 'it should have returned on its own, not been rescued');
    assert.ok(
      diagnostics.reported.some((entry) => entry.message.includes('Could not watch')),
      'it should say which directory it could not watch',
    );
  } finally {
    clearTimeout(guard);
  }
});

test('a file given where a directory belongs is reported, not watched', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-watch-'));
  const file = path.join(directory, 'Example.feature');
  fs.writeFileSync(file, 'Feature: A\n');

  const diagnostics = collectDiagnostics();
  const controller = new AbortController();
  const guard = setTimeout(() => controller.abort(), 5000);

  try {
    const code = await watch(
      [file],
      CONFIG,
      {diagnostics, signal: controller.signal},
      async () => undefined,
    );
    assert.equal(code, 0);
    assert.ok(!controller.signal.aborted, 'it should have returned on its own');
  } finally {
    clearTimeout(guard);
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('checks again when a listed file outside the watched directory changes', async () => {
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-watch-config-'));
  const config = path.join(elsewhere, 'team.json');
  fs.writeFileSync(config, '{}');

  const watched = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-watch-'));
  const controller = new AbortController();
  let passes = 0;
  const stopped = watch(
    [watched],
    config,
    {diagnostics: collectDiagnostics(), settleMs: 10, signal: controller.signal, files: () => [config]},
    async () => {
      passes += 1;
    },
  );

  try {
    await waitFor('the first pass', () => passes >= 1);
    await waitFor(
      'a pass for the configuration',
      () => passes >= 2,
      () => fs.writeFileSync(config, `{"x": ${Date.now()}}`),
    );
  } finally {
    controller.abort();
    await stopped;
    fs.rmSync(watched, {recursive: true, force: true});
    fs.rmSync(elsewhere, {recursive: true, force: true});
  }
});

test('isInteresting matches a configuration named with a directory', () => {
  assert.ok(isInteresting('rc.json', 'config/rc.json'));
  assert.ok(isInteresting('config/rc.json', 'config/rc.json'));
});

test('isInteresting picks feature files and the configuration', () => {
  assert.ok(isInteresting('features/Login.feature', CONFIG));
  assert.ok(isInteresting(CONFIG, CONFIG));
  assert.ok(isInteresting(`nested/${CONFIG}`, CONFIG));
  assert.ok(!isInteresting('features/notes.txt', CONFIG));
  assert.ok(!isInteresting('src/index.ts', CONFIG));
  assert.ok(!isInteresting('features', CONFIG));
});

test('featureRoots gives the directories a pattern could draw from', () => {
  const cwd = process.cwd();
  assert.deepEqual(featureRoots([]), [cwd]);
  assert.deepEqual(featureRoots(['.']), [cwd]);
  assert.deepEqual(featureRoots(['test/rules']), [path.resolve('test/rules')]);
});

test('featureRoots drops a directory already covered by another', () => {
  // A recursive watch on the parent already reports everything below it, and
  // watching both would report every change twice.
  assert.deepEqual(featureRoots(['test', 'test/rules', 'test/linter']), [path.resolve('test')]);
});

test('featureRoots ignores a pattern that names nothing', () => {
  assert.deepEqual(featureRoots(['nowhere-at-all']), []);
});

test('names a change by its path, and counts files sharing a name apart', async () => {
  await withWatch(async ({directory, passes, notices}) => {
    fs.mkdirSync(path.join(directory, 'one'));
    fs.mkdirSync(path.join(directory, 'two'));
    await waitFor(
      'a pass for the two files',
      () => notices().some((message) => /2 files changed/u.test(message)),
      () => {
        fs.writeFileSync(path.join(directory, 'one', 'Same.feature'), 'Feature: A\n');
        fs.writeFileSync(path.join(directory, 'two', 'Same.feature'), 'Feature: B\n');
      },
    );
    assert.ok(passes() >= 2);

    await waitFor(
      'a notice naming the path',
      () => notices().some((message) => message.includes(`${path.join('one', 'Same.feature')} changed`)),
      () => fs.writeFileSync(path.join(directory, 'one', 'Same.feature'), 'Feature: C\n'),
    );
  });
});

test('checks again when a folder of feature files is moved in or renamed', async () => {
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-elsewhere-'));
  try {
    fs.mkdirSync(path.join(elsewhere, 'incoming'));
    fs.writeFileSync(path.join(elsewhere, 'incoming', 'Moved.feature'), 'Feature: A\n');

    await withWatch(async ({directory, passes}) => {
      const target = path.join(directory, 'incoming');
      await waitFor(
        'a pass for the folder moved in',
        () => passes() >= 2,
        () => {
          if (!fs.existsSync(target)) fs.renameSync(path.join(elsewhere, 'incoming'), target);
        },
      );

      const before = passes();
      const renamed = path.join(directory, 'renamed');
      await waitFor(
        'a pass for the folder renamed',
        () => passes() > before,
        () => {
          if (fs.existsSync(renamed)) fs.renameSync(renamed, target);
          else fs.renameSync(target, renamed);
        },
      );
    });
  } finally {
    fs.rmSync(elsewhere, {recursive: true, force: true});
  }
});

test('given only some feature files, a change to another one beside them is passed over', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-watch-only-'));
  const watched = path.join(directory, 'a.feature');
  fs.writeFileSync(watched, 'Feature: A\n');
  const controller = new AbortController();
  const diagnostics = collectDiagnostics();
  let passes = 0;
  const stopped = watch(
    [directory],
    CONFIG,
    {diagnostics, settleMs: 10, signal: controller.signal, only: new Set([watched])},
    async () => {
      passes += 1;
    },
  );
  try {
    await waitFor('the watch to settle', () =>
      diagnostics.reported.some((entry) => entry.message.includes('Watching for changes')),
    );
    fs.writeFileSync(path.join(directory, 'b.feature'), 'Feature: B\n');
    // Long enough for a change to b.feature to have been taken up on its own.
    await new Promise((resolve) => setTimeout(resolve, 300));
    // Then the file itself, so there is a pass to look at. macOS may deliver
    // the event for writing a.feature before the watch late, which is why
    // what is checked is what the notices name, not how many passes ran.
    const before = passes;
    await waitFor('a pass for the file itself', () => passes > before, () => fs.writeFileSync(watched, 'Feature: A2\n'));
    const named = diagnostics.reported.map((entry) => entry.message).filter((message) => message.includes('changed'));
    assert.ok(named.every((message) => !message.includes('b.feature')), JSON.stringify(named));
  } finally {
    controller.abort();
    await stopped;
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('a new empty directory starts no pass, and a directory is not counted as a file', async () => {
  await withWatch(async ({directory, passes, notices}) => {
    fs.mkdirSync(path.join(directory, 'empty'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(passes(), 1, 'an empty directory changes nothing');

    fs.mkdirSync(path.join(directory, 'gone'));
    const before = passes();
    await waitFor('a pass for the file in it', () => passes() > before, () =>
      fs.writeFileSync(path.join(directory, 'gone', 'a.feature'), 'Feature: A\n'),
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    const removed = passes();
    fs.rmSync(path.join(directory, 'gone'), {recursive: true});
    await waitFor('a pass for the removal', () => passes() > removed);
    const counts = notices().filter((message) => /\d+ (files?|director)/u.test(message));
    assert.ok(counts.every((message) => !/2 files changed/u.test(message)), JSON.stringify(counts));
  });
});

test('a change during a pass is announced when the pass that takes it in starts', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-watch-mid-'));
  const controller = new AbortController();
  const log: string[] = [];
  const diagnostics = {report: ({message}: {message: string}) => log.push(message)};
  let passes = 0;
  let release: (() => void) | undefined;
  const stopped = watch([directory], CONFIG, {diagnostics, settleMs: 10, signal: controller.signal}, async () => {
    passes += 1;
    log.push(`start ${passes}`);
    if (passes === 2) {
      await new Promise<void>((resolve) => (release = resolve));
    }
    log.push(`end ${passes}`);
  });
  try {
    await waitFor('the watch to settle', () => log.some((message) => message.includes('Watching for changes')));
    await waitFor('a slow pass', () => passes >= 2, () => fs.writeFileSync(path.join(directory, 'a.feature'), 'Feature: A\n'));
    await waitFor('the pass to be held', () => release !== undefined);
    fs.writeFileSync(path.join(directory, 'b.feature'), 'Feature: B\n');
    await new Promise((resolve) => setTimeout(resolve, 300));
    release!();
    await waitFor('the pass after it', () => passes >= 3);
    // macOS may deliver a late event for a.feature too, so the notice may
    // count two files; what matters is where it comes.
    const during = log.slice(log.indexOf('start 2'), log.indexOf('end 2'));
    const after = log.slice(log.indexOf('end 2'), log.indexOf('start 3'));
    assert.ok(!during.some((message) => message.includes('changed')), JSON.stringify(log));
    assert.ok(after.some((message) => message.includes('changed')), JSON.stringify(log));
  } finally {
    controller.abort();
    await stopped;
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('checks again when a listed file in a directory listed only after a pass changes', async () => {
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-watch-later-'));
  const later = path.join(elsewhere, 'team.json');
  fs.writeFileSync(later, '{}');
  const watched = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-watch-'));
  const controller = new AbortController();
  const diagnostics = collectDiagnostics();
  let passes = 0;
  // As a configuration that starts extending a file elsewhere: listed from
  // the second pass on.
  const stopped = watch(
    [watched],
    CONFIG,
    {diagnostics, settleMs: 10, signal: controller.signal, files: () => (passes >= 2 ? [later] : [])},
    async () => {
      passes += 1;
    },
  );
  try {
    await waitFor('the watch to settle', () =>
      diagnostics.reported.some((entry) => entry.message.includes('Watching for changes')),
    );
    await waitFor('a second pass', () => passes >= 2, () =>
      fs.writeFileSync(path.join(watched, 'a.feature'), `Feature: ${Date.now()}\n`),
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    const before = passes;
    await waitFor('a pass for the file now listed', () => passes > before, () =>
      fs.writeFileSync(later, `{"x": ${Date.now()}}`),
    );
  } finally {
    controller.abort();
    await stopped;
    fs.rmSync(watched, {recursive: true, force: true});
    fs.rmSync(elsewhere, {recursive: true, force: true});
  }
});

test('a file with no extension going is not taken for a directory, and starts no pass', async () => {
  await withWatch(async ({directory, passes, notices}) => {
    fs.writeFileSync(path.join(directory, 'Makefile'), 'all:\n');
    await new Promise((resolve) => setTimeout(resolve, 300));
    const before = passes();
    fs.rmSync(path.join(directory, 'Makefile'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(passes(), before);
    assert.ok(notices().every((message) => !message.includes('Makefile')), JSON.stringify(notices()));
  });
});

test('a directory of feature files going is still a change, named as a directory', async () => {
  await withWatch(async ({directory, passes, notices}) => {
    fs.mkdirSync(path.join(directory, 'gone'));
    fs.writeFileSync(path.join(directory, 'gone', 'a.feature'), 'Feature: A\n');
    await new Promise((resolve) => setTimeout(resolve, 300));
    const before = passes();
    fs.rmSync(path.join(directory, 'gone'), {recursive: true});
    await waitFor('a pass for the removal', () => passes() > before);
    assert.ok(notices().some((message) => message.includes(`gone${path.sep} changed`) || /director/u.test(message)), JSON.stringify(notices()));
  });
});
