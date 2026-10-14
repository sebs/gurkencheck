/**
 * What a run is waiting for from code it does not own - a custom rule, a
 * formatter.
 *
 * A promise that never settles leaves nothing for node to do, and it ends
 * the process as though the run were over, without a word about why. Noted
 * here, the plugin that returned it can be named.
 */

const waiting = new Map<string, number>();

/** `value` awaited, with `what` noted as waited for until it settles. */
export async function waitFor<T>(what: string, value: T | PromiseLike<T>): Promise<T> {
  waiting.set(what, (waiting.get(what) ?? 0) + 1);
  try {
    return await value;
  } finally {
    const left = waiting.get(what)! - 1;
    if (left === 0) {
      waiting.delete(what);
    } else {
      waiting.set(what, left);
    }
  }
}

/** What is being waited for now, in the order it was first waited for. */
export function stillWaitingFor(): string[] {
  return [...waiting.keys()];
}
