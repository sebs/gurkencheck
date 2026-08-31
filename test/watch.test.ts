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

/** Waits for something to become true, rather than for a fixed time. */
async function waitFor(
  what: string,
  condition: () => boolean,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      assert.fail(`timed out waiting for ${what}`);
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
    fs.writeFileSync(path.join(directory, 'New.feature'), 'Feature: A\n');
    await waitFor('a second pass', () => passes() >= 2);
  });
});

test('checks again when a feature file changes', async () => {
  await withWatch(async ({directory, passes}) => {
    const file = path.join(directory, 'Edited.feature');
    fs.writeFileSync(file, 'Feature: A\n');
    await waitFor('the pass for the new file', () => passes() >= 2);

    const before = passes();
    fs.writeFileSync(file, 'Feature: B\n');
    await waitFor('the pass for the edit', () => passes() > before);
  });
});

test('checks again when the configuration changes', async () => {
  await withWatch(async ({directory, passes}) => {
    fs.writeFileSync(path.join(directory, CONFIG), '{"no-unnamed-scenarios": "on"}');
    await waitFor('a pass for the configuration', () => passes() >= 2);
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

    fs.writeFileSync(path.join(directory, 'Real.feature'), 'Feature: A\n');
    await waitFor('a pass for the feature file', () => passes() >= 2);
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

    fs.writeFileSync(path.join(directory, 'Named.feature'), 'Feature: A\n');
    await waitFor('a second pass', () => passes() >= 2);
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
    fs.writeFileSync(path.join(directory, 'A.feature'), 'Feature: A\n');
    await waitFor('the failing pass', () => passes >= 2);
    fs.writeFileSync(path.join(directory, 'B.feature'), 'Feature: B\n');
    await waitFor('a pass after the failure', () => passes >= 3);
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
  assert.deepEqual(featureRoots(['nowhere-at-all**']), []);
});
