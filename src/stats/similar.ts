/**
 * Finding steps that are nearly, but not quite, the same step.
 *
 * `I am logged in` and `I'm logged in` are one behaviour written twice, and
 * they cost two step definitions. Normalisation cannot join them - they
 * really are different sentences - so they are grouped by how many single
 * character edits it takes to turn one into the other.
 *
 * Comparing every pair is quadratic in the number of distinct steps, which on
 * a large suite is hundreds of millions of comparisons, so the steps that
 * could be close are looked up by the pieces they share (see groupSimilar),
 * and two cheap tests run before an edit distance. Both are lower bounds on
 * the distance, never overestimates, so a pair they reject could not have
 * been close enough anyway:
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

interface Candidate {
  index: number;
  text: string;
  tally: number[];
}

/**
 * The pieces a step is cut into for the search: `edits + 1` of them, as even
 * in length as they can be, each with where it starts.
 */
function pieces(length: number, edits: number): {start: number; length: number}[] {
  const count = edits + 1;
  const short = Math.floor(length / count);
  const longer = length % count;
  const cut: {start: number; length: number}[] = [];
  let start = 0;
  for (let piece = 0; piece < count; piece++) {
    const pieceLength = piece < count - longer ? short : short + 1;
    cut.push({start, length: pieceLength});
    start += pieceLength;
  }
  return cut;
}

/**
 * Groups entries whose text is close enough to be the same step written two
 * ways. Entries that are close to nothing are left out, so every group
 * returned has at least two members, in the order they were given in.
 *
 * Entries come most used first, and a group is built around the first entry
 * not yet in one: it takes every other entry still free that is within the
 * budget of it. So every member is a few edits from the group's first, most
 * used step - joining any two close steps instead let a chain of one-edit
 * neighbours gather steps that are nothing alike, `the cat sat on the mat`
 * with `the bot sit in the hut`.
 *
 * Comparing every step with every other of about its length is quadratic,
 * and a suite of twenty thousand steps took over a minute. The search uses
 * the pigeonhole filter of pass-join instead: cut a step into `maxEdits + 1`
 * pieces, and that many edits leave at least one of them untouched - so a
 * step close to it holds that piece too, moved by no more than `maxEdits`
 * places. Only the steps found holding such a piece are compared at all.
 */
export function groupSimilar<T extends {text: string}>(
  entries: readonly T[],
  options: SimilarityOptions = DEFAULT_SIMILARITY,
): T[][] {
  const edits = options.maxEdits;
  if (edits < 1) {
    return [];
  }
  const candidates: Candidate[] = entries
    .map((entry, index) => ({index, text: entry.text, tally: tally(entry.text)}))
    .filter((candidate) => candidate.text.length >= options.minLength);

  /** `length:piece:text` -> the candidates of that length holding that piece. */
  const index = new Map<string, Candidate[]>();
  /** Candidates too short to cut into pieces, compared with every step. */
  const short: Candidate[] = [];
  for (const candidate of candidates) {
    const {length} = candidate.text;
    if (length <= edits) {
      short.push(candidate);
      continue;
    }
    pieces(length, edits).forEach((piece, number) => {
      const key = `${length}:${number}:${candidate.text.slice(piece.start, piece.start + piece.length)}`;
      const holding = index.get(key);
      if (holding === undefined) {
        index.set(key, [candidate]);
      } else {
        holding.push(candidate);
      }
    });
  }

  /** The candidates that could be within the budget of `step`. */
  const nearby = (step: Candidate): Iterable<Candidate> => {
    const length = step.text.length;
    if (length <= edits) {
      return candidates;
    }
    const found = new Set<Candidate>(short);
    for (let other = Math.max(edits + 1, length - edits); other <= length + edits; other++) {
      pieces(other, edits).forEach((piece, number) => {
        const from = Math.max(0, piece.start - edits);
        const to = Math.min(length - piece.length, piece.start + edits);
        for (let start = from; start <= to; start++) {
          const key = `${other}:${number}:${step.text.slice(start, start + piece.length)}`;
          for (const candidate of index.get(key) ?? []) {
            found.add(candidate);
          }
        }
      });
    }
    return found;
  };

  const close = (a: Candidate, b: Candidate): boolean => {
    const [shorter, longer] = a.text.length <= b.text.length ? [a, b] : [b, a];
    const limit = Math.min(edits, Math.floor((1 - options.ratio) * longer.text.length));
    return (
      limit >= 1 &&
      longer.text.length - shorter.text.length <= limit &&
      !tallyRulesOut(shorter.tally, longer.tally, limit) &&
      boundedEditDistance(shorter.text, longer.text, limit) <= limit
    );
  };

  const grouped = new Set<Candidate>();
  const groups: T[][] = [];
  for (const anchor of candidates) {
    if (grouped.has(anchor)) {
      continue;
    }
    const members = [anchor];
    for (const candidate of nearby(anchor)) {
      if (candidate !== anchor && !grouped.has(candidate) && close(anchor, candidate)) {
        members.push(candidate);
      }
    }
    if (members.length > 1) {
      for (const member of members) {
        grouped.add(member);
      }
      groups.push(members.sort((a, b) => a.index - b.index).map((member) => entries[member.index]!));
    }
  }
  return groups;
}
