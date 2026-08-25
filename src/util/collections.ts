/**
 * The handful of collection helpers this project used to pull in from lodash.
 * Each one is a few lines of vanilla TypeScript.
 */

/** Removes duplicate values, keeping the first occurrence of each. */
export function uniq<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/**
 * Returns a new array sorted by the selected key. `Array.prototype.sort` is
 * stable, so items with an equal key keep their original relative order.
 */
export function sortBy<T>(values: readonly T[], select: (value: T) => number | string): T[] {
  return [...values].sort((a, b) => {
    const left = select(a);
    const right = select(b);
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  });
}

/** Buckets values by the selected key, preserving insertion order. */
export function groupBy<T, K>(values: readonly T[], select: (value: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const value of values) {
    const key = select(value);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [value]);
    } else {
      group.push(value);
    }
  }
  return groups;
}

/** Values present in every one of the given groups, without duplicates. */
export function intersection<T>(groups: readonly (readonly T[])[]): T[] {
  const [first, ...rest] = groups;
  if (first === undefined) {
    return [];
  }
  return uniq(first).filter((value) => rest.every((group) => group.includes(value)));
}

/**
 * Values from `values` whose selected key also appears in `other`, without
 * duplicate keys.
 */
export function intersectionBy<T>(
  values: readonly T[],
  other: readonly T[],
  select: (value: T) => unknown,
): T[] {
  const otherKeys = new Set(other.map(select));
  const taken = new Set<unknown>();
  return values.filter((value) => {
    const key = select(value);
    if (!otherKeys.has(key) || taken.has(key)) {
      return false;
    }
    taken.add(key);
    return true;
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Recursively merges `override` onto a copy of `defaults`. Plain objects are
 * merged key by key; everything else (including arrays) is replaced outright.
 * `undefined` values in `override` never win over a default.
 *
 * Neither argument is mutated - the old lodash-based rules accidentally wrote
 * their overrides back into the shared default config object.
 */
export function mergeDefaults<T>(defaults: T, override: unknown): T {
  if (!isPlainObject(defaults) || !isPlainObject(override)) {
    return (override === undefined ? defaults : override) as T;
  }
  const merged: Record<string, unknown> = {...defaults};
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) {
      continue;
    }
    merged[key] = isPlainObject(merged[key]) ? mergeDefaults(merged[key], value) : value;
  }
  return merged as T;
}
