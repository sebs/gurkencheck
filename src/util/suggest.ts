/**
 * Offering the name somebody most likely meant.
 */
import {boundedEditDistance} from '../stats/similar.ts';

/**
 * The candidate closest to `name` within `maxEdits` single-character edits,
 * ignoring case, or `undefined` when none is that close. A typo is a letter
 * or two out; further than that, a suggestion is a guess.
 */
export function closest(name: string, candidates: Iterable<string>, maxEdits = 3): string | undefined {
  const wanted = name.toLowerCase();
  let best: string | undefined;
  let bestDistance = maxEdits + 1;
  for (const candidate of candidates) {
    const distance = boundedEditDistance(wanted, candidate.toLowerCase(), bestDistance - 1);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}
