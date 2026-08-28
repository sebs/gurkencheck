import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DEFAULT_SIMILARITY, boundedEditDistance, groupSimilar} from '../../src/stats/similar.ts';

test('edit distance counts single character changes', () => {
  assert.equal(boundedEditDistance('kitten', 'sitting', 10), 3);
  assert.equal(boundedEditDistance('same', 'same', 10), 0);
});

test('edit distance gives up rather than finishing a hopeless comparison', () => {
  assert.equal(boundedEditDistance('kitten', 'sitting', 2), 3);
  assert.equal(boundedEditDistance('abc', 'xyz', 1), 2);
});

/** The entries `groupSimilar` works on, cut down to what it reads. */
function steps(...texts: string[]): {text: string}[] {
  return texts.map((text) => ({text}));
}

test('two spellings of one step are grouped', () => {
  const groups = groupSimilar(steps('i am logged in', "i'm logged in", 'i check out'));
  assert.deepEqual(
    groups.map((group) => group.map((entry) => entry.text)),
    [['i am logged in', "i'm logged in"]],
  );
});

test('an outline placeholder and the value written in its place are grouped', () => {
  const groups = groupSimilar(steps('i have 0 items in my cart', 'i have <> items in my cart'));
  assert.equal(groups.length, 1);
});

test('steps that only share a shape are left alone', () => {
  assert.deepEqual(groupSimilar(steps('i check out', 'i see 0 order', 'i pay with ""')), []);
});

test('a chain of small differences becomes one group, not three', () => {
  const groups = groupSimilar(steps('the cart is empty', 'the cart is emptu', 'the cart is emptv'));
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.length, 3);
});

test('short steps are left out, where everything looks like everything', () => {
  assert.deepEqual(groupSimilar(steps('i wait', 'i wait 0')), []);
});

test('members come back in the order they were given in', () => {
  const groups = groupSimilar(steps('the cart is emptu', 'x'.repeat(40), 'the cart is empty'));
  assert.deepEqual(groups[0]?.map((entry) => entry.text), [
    'the cart is emptu',
    'the cart is empty',
  ]);
});

test('a looser setting finds more groups', () => {
  // Four edits apart: further than either default allows.
  const entries = steps('the cart is empty', 'the cart is not empty');
  assert.equal(groupSimilar(entries, DEFAULT_SIMILARITY).length, 0);
  assert.equal(groupSimilar(entries, {ratio: 0.7, minLength: 8, maxEdits: 6}).length, 1);
});

test('the edit cap holds however long the steps are', () => {
  const entries = steps(
    'the customer opens the order from the archive',
    'the customer opens the basket from the archive',
  );
  assert.equal(groupSimilar(entries, DEFAULT_SIMILARITY).length, 0);
  assert.equal(groupSimilar(entries, {ratio: 0.85, minLength: 8, maxEdits: 8}).length, 1);
});
