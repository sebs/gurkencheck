/**
 * Working through a list without starting all of it at once.
 */

/** Values to work through, however they arrive. */
export type Sequence<T> = Iterable<T> | AsyncIterable<T>;

/** One iterator over either kind, so the rest need not care which it is. */
async function* asAsync<T>(values: Sequence<T>): AsyncGenerator<T> {
  if (Symbol.asyncIterator in values) {
    yield* values;
  } else {
    yield* values;
  }
}

/**
 * Maps over the values, keeping at most `window` results in flight, and hands
 * each one over in the order the values were given.
 *
 * `Promise.all` over a list starts every one of them at once, which for a
 * list of files means a file descriptor each and every result held in memory
 * until the last one arrives. A window bounds both: what is held is a
 * property of the window rather than of the length of the list.
 *
 * Results come back in order whatever order they finish in, so a caller that
 * cares about the order the values were given - and the rules looking across
 * files do - gets it without sorting anything.
 *
 * Stopping early stops the work: nothing beyond the window is started, what
 * is left is dropped, and a source still producing values is closed.
 *
 * The values may arrive as an array or as something producing them one at a
 * time, so a walk of a directory tree can feed this without being collected
 * first.
 *
 * `map` must not reject. A result is started before anything awaits it, so a
 * rejection would be an unhandled one rather than something the caller could
 * catch.
 */
export async function* mapWithWindow<T, R>(
  values: Sequence<T>,
  window: number,
  map: (value: T) => Promise<R>,
): AsyncGenerator<R> {
  const width = Math.max(1, Math.trunc(window));
  const source = asAsync(values);
  const inFlight: Promise<R>[] = [];
  let drained = false;

  const fill = async (): Promise<void> => {
    while (!drained && inFlight.length < width) {
      const next = await source.next();
      if (next.done === true) {
        drained = true;
        return;
      }
      inFlight.push(map(next.value));
    }
  };

  try {
    await fill();
    while (inFlight.length > 0) {
      // Taken from the front, so the order in is the order out.
      const result = await inFlight.shift()!;
      yield result;
      await fill();
    }
  } finally {
    // Stopping early stops the source too, so a walk feeding this does not
    // carry on over a tree nobody is going to look at.
    await source.return(undefined);
  }
}
