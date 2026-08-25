import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  groupBy,
  intersection,
  intersectionBy,
  mergeDefaults,
  sortBy,
  uniq,
} from '../../src/util/collections.ts';

test('uniq keeps the first occurrence of each value', () => {
  assert.deepEqual(uniq([3, 1, 3, 2, 1]), [3, 1, 2]);
});

test('sortBy is stable for equal keys', () => {
  const values = [
    {key: 1, tag: 'a'},
    {key: 0, tag: 'b'},
    {key: 1, tag: 'c'},
  ];
  assert.deepEqual(
    sortBy(values, (value) => value.key).map((value) => value.tag),
    ['b', 'a', 'c'],
  );
});

test('sortBy leaves the original array untouched', () => {
  const values = [3, 1, 2];
  sortBy(values, (value) => value);
  assert.deepEqual(values, [3, 1, 2]);
});

test('groupBy buckets by key in insertion order', () => {
  const grouped = groupBy(['aa', 'b', 'cc'], (value) => value.length);
  assert.deepEqual([...grouped], [
    [2, ['aa', 'cc']],
    [1, ['b']],
  ]);
});

test('intersection returns values present in every group', () => {
  assert.deepEqual(intersection([[1, 2, 3], [2, 3, 4], [3, 2]]), [2, 3]);
});

test('intersection of no groups is empty', () => {
  assert.deepEqual(intersection([]), []);
});

test('intersection of one group removes duplicates', () => {
  assert.deepEqual(intersection([[1, 1, 2]]), [1, 2]);
});

test('intersectionBy compares on the selected key', () => {
  const left = [{name: 'a'}, {name: 'b'}, {name: 'a'}];
  const right = [{name: 'a'}];
  assert.deepEqual(intersectionBy(left, right, (value) => value.name), [{name: 'a'}]);
});

test('mergeDefaults fills in missing keys', () => {
  assert.deepEqual(mergeDefaults({a: 1, b: 2}, {b: 3}), {a: 1, b: 3});
});

test('mergeDefaults merges nested objects', () => {
  const defaults = {size: {small: 1, large: 2}};
  assert.deepEqual(mergeDefaults(defaults, {size: {large: 9}}), {size: {small: 1, large: 9}});
});

test('mergeDefaults replaces arrays outright', () => {
  assert.deepEqual(mergeDefaults({tags: ['a', 'b']}, {tags: ['c']}), {tags: ['c']});
});

test('mergeDefaults never writes back into the defaults', () => {
  const defaults = {size: {small: 1}};
  mergeDefaults(defaults, {size: {small: 99}});
  assert.deepEqual(defaults, {size: {small: 1}});
});

test('mergeDefaults ignores undefined overrides', () => {
  assert.deepEqual(mergeDefaults({a: 1}, undefined), {a: 1});
  assert.deepEqual(mergeDefaults({a: 1}, {a: undefined}), {a: 1});
});
