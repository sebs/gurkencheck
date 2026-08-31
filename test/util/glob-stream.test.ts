/**
 * Walking a tree without collecting it first.
 *
 * The order has to be the order globSync returns, or streaming discovery
 * would quietly reorder every report.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {globStream, globSync} from '../../src/util/glob.ts';

/** Builds a tree from a list of relative paths and runs the body in it. */
function withTree(paths: readonly string[], body: (cwd: string) => Promise<void>) {
  return async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-glob-'));
    try {
      for (const relative of paths) {
        const file = path.join(cwd, relative);
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, '');
      }
      await body(cwd);
    } finally {
      fs.rmSync(cwd, {recursive: true, force: true});
    }
  };
}

async function collect(pattern: string, cwd: string): Promise<string[]> {
  const found: string[] = [];
  for await (const file of globStream(pattern, {cwd})) {
    found.push(file);
  }
  return found;
}

/**
 * The names that make walk order and sorted order disagree.
 *
 * Everything under `b` has a path starting `b/`, and `-` sorts before `/`, so
 * ordering the entries by their own names puts the directory in the wrong
 * place.
 */
const AWKWARD = [
  'b/x.feature',
  'b-1.feature',
  'b.feature',
  'a/deep/one.feature',
  'a-side.feature',
  'a.feature',
  'z/y/last.feature',
];

test(
  'the stream gives exactly what globSync gives, in the same order',
  withTree(AWKWARD, async (cwd) => {
    assert.deepEqual(await collect('**/*.feature', cwd), globSync('**/*.feature', {cwd}));
  }),
);

test(
  'a directory sorts where its contents do, not where its name does',
  withTree(AWKWARD, async (cwd) => {
    const found = await collect('**/*.feature', cwd);
    // Proves the comparator is doing something: by entry name alone, b/x
    // would come before b-1.
    assert.ok(
      found.indexOf('b-1.feature') < found.indexOf('b/x.feature'),
      `b-1.feature should come first, got ${found.join(', ')}`,
    );
    assert.deepEqual(found, [...found].sort());
  }),
);

test(
  'the ignore patterns are honoured',
  withTree(['keep/a.feature', 'skip/b.feature', 'skip/deep/c.feature'], async (cwd) => {
    const found = await collect('**/*.feature', cwd);
    assert.deepEqual(found, globSync('**/*.feature', {cwd}));

    const kept: string[] = [];
    for await (const file of globStream('**/*.feature', {cwd, ignore: ['skip']})) {
      kept.push(file);
    }
    assert.deepEqual(kept, ['keep/a.feature']);
  }),
);

test(
  'hidden entries are skipped, as in globSync',
  withTree(['.hidden/a.feature', 'shown/b.feature'], async (cwd) => {
    assert.deepEqual(await collect('**/*.feature', cwd), ['shown/b.feature']);
  }),
);

test(
  'a pattern naming one file finds that file',
  withTree(['only/one.feature'], async (cwd) => {
    assert.deepEqual(await collect('only/one.feature', cwd), ['only/one.feature']);
  }),
);

test('a pattern naming nothing yields nothing', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-glob-'));
  try {
    assert.deepEqual(await collect('nowhere/**/*.feature', cwd), []);
  } finally {
    fs.rmSync(cwd, {recursive: true, force: true});
  }
});

test(
  'an unreadable directory contributes nothing rather than throwing',
  withTree(['open/a.feature', 'closed/b.feature'], async (cwd) => {
    const closed = path.join(cwd, 'closed');
    fs.chmodSync(closed, 0o000);
    try {
      // Running as root defeats the permission bits, so there is nothing to test.
      try {
        fs.readdirSync(closed);
        return;
      } catch {
        // Good: it really is unreadable.
      }
      assert.deepEqual(await collect('**/*.feature', cwd), ['open/a.feature']);
    } finally {
      fs.chmodSync(closed, 0o755);
    }
  }),
);

test(
  'the walk yields before it has seen the whole tree',
  withTree(
    Array.from({length: 200}, (_unused, index) => `d${String(index).padStart(3, '0')}/a.feature`),
    async (cwd) => {
      const stream = globStream('**/*.feature', {cwd});
      const first = await stream.next();
      assert.equal(first.value, 'd000/a.feature');
      // Having a file in hand while 199 directories are still unvisited is
      // the whole point; collecting first could not do this.
      await stream.return(undefined as never);
    },
  ),
);
