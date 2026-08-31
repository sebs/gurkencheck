/**
 * Working through a list without starting all of it at once.
 */

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
 * Stopping early stops the work: nothing beyond the window is started, and
 * `return` on the generator drops what is left.
 *
 * `map` must not reject. A result is started before anything awaits it, so a
 * rejection would be an unhandled one rather than something the caller could
 * catch.
 */
export async function* mapWithWindow<T, R>(
  values: readonly T[],
  window: number,
  map: (value: T) => Promise<R>,
): AsyncGenerator<R> {
  const width = Math.max(1, Math.trunc(window));
  const inFlight: Promise<R>[] = [];
  let next = 0;

  const fill = (): void => {
    while (inFlight.length < width && next < values.length) {
      inFlight.push(map(values[next++]!));
    }
  };

  fill();
  while (inFlight.length > 0) {
    // Taken from the front, so the order in is the order out.
    yield await inFlight.shift()!;
    fill();
  }
}
