import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mapWithWindow} from '../../src/util/stream.ts';

/**
 * A map that records how many calls are in flight at once, and only settles
 * when told to, so the window can be watched rather than guessed at.
 */
function watched() {
  const state = {live: 0, peak: 0, started: [] as number[]};
  const release: (() => void)[] = [];

  const map = async (value: number): Promise<number> => {
    state.live += 1;
    state.peak = Math.max(state.peak, state.live);
    state.started.push(value);
    await new Promise<void>((resolve) => release.push(resolve));
    state.live -= 1;
    return value * 2;
  };

  /** Lets every call made so far finish. */
  const releaseAll = (): void => {
    while (release.length > 0) {
      release.shift()!();
    }
  };

  return {state, map, releaseAll};
}

const upTo = (count: number): number[] => Array.from({length: count}, (_unused, index) => index);

test('keeps at most the window in flight', async () => {
  const {state, map, releaseAll} = watched();
  const timer = setInterval(releaseAll, 0);

  try {
    const seen = [];
    for await (const value of mapWithWindow(upTo(50), 5, map)) {
      seen.push(value);
    }
    assert.equal(seen.length, 50);
    assert.equal(state.peak, 5, `expected 5 in flight at the peak, saw ${state.peak}`);
  } finally {
    clearInterval(timer);
  }
});

test('hands results over in the order the values were given', async () => {
  // Later values finish first, so ordering cannot be an accident of timing.
  const map = async (value: number): Promise<number> => {
    await new Promise((resolve) => setTimeout(resolve, (10 - value) * 2));
    return value;
  };

  const seen = [];
  for await (const value of mapWithWindow(upTo(10), 10, map)) {
    seen.push(value);
  }
  assert.deepEqual(seen, upTo(10));
});

test('starts nothing beyond the window before it is needed', async () => {
  const {state, map, releaseAll} = watched();
  const timer = setInterval(releaseAll, 0);

  try {
    const stream = mapWithWindow(upTo(100), 4, map);
    await stream.next();
    // One taken, so a fifth may have been started to refill - no more.
    assert.ok(state.started.length <= 5, `started ${state.started.length} of 100`);
    await stream.return(undefined as never);
  } finally {
    clearInterval(timer);
  }
});

test('stopping early leaves the rest unstarted', async () => {
  const {state, map, releaseAll} = watched();
  const timer = setInterval(releaseAll, 0);

  try {
    for await (const _value of mapWithWindow(upTo(100), 3, map)) {
      break;
    }
    assert.ok(state.started.length <= 4, `started ${state.started.length} of 100`);
  } finally {
    clearInterval(timer);
  }
});

test('a window smaller than one still makes progress', async () => {
  const seen = [];
  for await (const value of mapWithWindow(upTo(3), 0, async (value) => value)) {
    seen.push(value);
  }
  assert.deepEqual(seen, [0, 1, 2]);
});

test('an empty list yields nothing', async () => {
  const seen: number[] = [];
  for await (const value of mapWithWindow<number, number>([], 4, async (value) => value)) {
    seen.push(value);
  }
  assert.deepEqual(seen, []);
});

test('a window wider than the list is not a problem', async () => {
  const {state, map, releaseAll} = watched();
  const timer = setInterval(releaseAll, 0);

  try {
    const seen = [];
    for await (const value of mapWithWindow(upTo(3), 500, map)) {
      seen.push(value);
    }
    assert.deepEqual(seen, [0, 2, 4]);
    assert.equal(state.peak, 3);
  } finally {
    clearInterval(timer);
  }
});
