/**
 * Finding steps that are nearly, but not quite, the same step.
 *
 * `I am logged in` and `I'm logged in` are one behaviour written twice, and
 * they cost two step definitions. Normalisation cannot join them - they
 * really are different sentences - so they are grouped by how many single
 * character edits it takes to turn one into the other.
 *
 * Edit distance is quadratic in the number of distinct steps, which on a
 * large suite is millions of comparisons, so two cheap tests run first. Both
 * are lower bounds on the distance, never overestimates, so a pair they
 * reject could not have been close enough anyway:
 *
 * - two strings are at least as far apart as their lengths differ;
 * - every edit changes the tally of characters by at most two, so half the
 *   difference between two tallies is a floor on the distance as well.
 */

/** How alike two steps have to be before they are reported together. */
export interface SimilarityOptions {
  /**
   * `1 - distance / length`, against the longer of the two steps. At 0.85 a
   * forty character step may differ by six edits.
   */
  ratio: number;
  /**
   * Steps shorter than this are left out. `I wait` and `I wait 0` are two
   * edits apart, and at that length almost everything looks like everything.
   */
  minLength: number;
  /**
   * Edits never allowed beyond, however long the steps are.
   *
   * The ratio on its own lets a long step drift a long way: six edits turn
   * `the customer opens the order in bulk` into `the customer opens the cart
   * in bulk`, which is a different step rather than the same one spelled two
   * ways. What this report is for is the small differences - an apostrophe, a
   * plural, a missing article - and three edits covers those.
   *
   * It is also what keeps the search quick: with a low cap two steps have to
   * be within a few characters in length before they are compared at all.
   */
  maxEdits: number;
}

export const DEFAULT_SIMILARITY: SimilarityOptions = {ratio: 0.85, minLength: 8, maxEdits: 3};

/** How many buckets the character tally uses. */
const TALLY_SIZE = 32;

/**
 * A rough tally of the characters in a string.
 *
 * Characters share buckets, which can only make two tallies look more alike
 * than they are - and since the tally is used to rule pairs out, looking more
 * alike is the safe direction to be wrong in.
 */
function tally(text: string): number[] {
  const counts = new Array<number>(TALLY_SIZE).fill(0);
  for (let index = 0; index < text.length; index++) {
    const bucket = text.charCodeAt(index) % TALLY_SIZE;
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  return counts;
}

/**
 * True when two tallies are far enough apart that no run of `limit` edits
 * could join the strings behind them.
 *
 * This is the test almost every pair fails, so it stops as soon as the answer
 * is settled rather than finishing the count.
 */
function tallyRulesOut(left: readonly number[], right: readonly number[], limit: number): boolean {
  const budget = limit * 2;
  let sum = 0;
  for (let bucket = 0; bucket < TALLY_SIZE; bucket++) {
    sum += Math.abs((left[bucket] ?? 0) - (right[bucket] ?? 0));
    if (sum > budget) {
      return true;
    }
  }
  return false;
}

/**
 * The Levenshtein distance between two strings, giving up as soon as it is
 * certain to exceed `limit` and returning `limit + 1` in that case.
 *
 * Every value in a row of the table is a lower bound on everything below it,
 * so once the whole row is past the limit there is no way back.
 */
export function boundedEditDistance(left: string, right: string, limit: number): number {
  if (left === right) {
    return 0;
  }
  if (Math.abs(left.length - right.length) > limit) {
    return limit + 1;
  }

  const width = right.length;
  let previous = Array.from({length: width + 1}, (_, index) => index);
  let current = new Array<number>(width + 1).fill(0);

  for (let row = 1; row <= left.length; row++) {
    current[0] = row;
    let rowMinimum = row;
    const leftCharacter = left.charCodeAt(row - 1);

    for (let column = 1; column <= width; column++) {
      const substitution =
        (previous[column - 1] ?? 0) + (leftCharacter === right.charCodeAt(column - 1) ? 0 : 1);
      const deletion = (previous[column] ?? 0) + 1;
      const insertion = (current[column - 1] ?? 0) + 1;
      const best = Math.min(substitution, deletion, insertion);
      current[column] = best;
      if (best < rowMinimum) {
        rowMinimum = best;
      }
    }

    if (rowMinimum > limit) {
      return limit + 1;
    }
    const finished = previous;
    previous = current;
    current = finished;
  }

  return previous[width] ?? limit + 1;
}

/** Disjoint sets, used to join pairs of close steps into groups. */
function makeSets(size: number): {find: (item: number) => number; union: (a: number, b: number) => void} {
  const parent = Array.from({length: size}, (_, index) => index);

  function find(item: number): number {
    let root = item;
    while ((parent[root] ?? root) !== root) {
      root = parent[root] ?? root;
    }
    let walk = item;
    while ((parent[walk] ?? walk) !== root) {
      const next = parent[walk] ?? walk;
      parent[walk] = root;
      walk = next;
    }
    return root;
  }

  return {
    find,
    union(a, b) {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) {
        parent[rootB] = rootA;
      }
    },
  };
}

/**
 * Groups entries whose text is close enough to be the same step written two
 * ways. Entries that are close to nothing are left out, so every group
 * returned has at least two members, in the order they were given in.
 */
export function groupSimilar<T extends {text: string}>(
  entries: readonly T[],
  options: SimilarityOptions = DEFAULT_SIMILARITY,
): T[][] {
  // Sorting by length lets the search stop early: once two steps are too
  // different in length, every step after this one is longer still.
  const candidates = entries
    .map((entry, index) => ({index, text: entry.text, tally: tally(entry.text)}))
    .filter((candidate) => candidate.text.length >= options.minLength)
    .sort((a, b) => a.text.length - b.text.length);

  const sets = makeSets(entries.length);
  let joined = false;

  for (let i = 0; i < candidates.length; i++) {
    const left = candidates[i]!;
    for (let j = i + 1; j < candidates.length; j++) {
      const right = candidates[j]!;
      const limit = Math.min(
        options.maxEdits,
        Math.floor((1 - options.ratio) * right.text.length),
      );

      // Sorted by length, so once a step is too much longer than this one,
      // every step after it is longer still.
      if (right.text.length - left.text.length > limit) {
        break;
      }
      if (limit < 1 || tallyRulesOut(left.tally, right.tally, limit)) {
        continue;
      }
      if (boundedEditDistance(left.text, right.text, limit) <= limit) {
        sets.union(left.index, right.index);
        joined = true;
      }
    }
  }

  if (!joined) {
    return [];
  }

  const groups = new Map<number, {index: number; entry: T}[]>();
  for (const candidate of candidates) {
    const root = sets.find(candidate.index);
    const member = {index: candidate.index, entry: entries[candidate.index]!};
    const group = groups.get(root);
    if (group === undefined) {
      groups.set(root, [member]);
    } else {
      group.push(member);
    }
  }

  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => group.sort((a, b) => a.index - b.index).map((member) => member.entry));
}
