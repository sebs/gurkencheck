import assert from 'node:assert/strict';
import {test} from 'node:test';
import {countWords, normaliseStepText} from '../../src/stats/normalise.ts';

test('two steps differing only in a number are the same step', () => {
  assert.equal(
    normaliseStepText('I have 3 items in my cart'),
    normaliseStepText('I have 17 items in my cart'),
  );
});

test('decimals and thousands are masked whole', () => {
  assert.equal(normaliseStepText('the total is 1.50'), 'the total is 0');
  assert.equal(normaliseStepText('the total is 1,000'), 'the total is 0');
});

test('digits that are part of a name are left alone', () => {
  assert.equal(normaliseStepText('the 1st item of v2'), 'the 1st item of v2');
});

test('two steps differing only in a quoted string are the same step', () => {
  assert.equal(normaliseStepText('I log in as "sebs"'), normaliseStepText('I log in as "ada"'));
  assert.equal(normaliseStepText('I log in as "sebs"'), 'i log in as ""');
});

test('an apostrophe is not treated as a quote', () => {
  assert.equal(normaliseStepText("the user's cart is 'empty'"), "the user's cart is 'empty'");
});

test('a placeholder is masked whatever it is called', () => {
  assert.equal(
    normaliseStepText('I have <count> items'),
    normaliseStepText('I have <howMany> items'),
  );
});

test('a quoted placeholder normalises like any other quoted string', () => {
  assert.equal(normaliseStepText('I pay with "<method>"'), normaliseStepText('I pay with "card"'));
});

test('case, spacing and a full stop do not make a new step', () => {
  assert.equal(normaliseStepText('I  Check   Out.'), normaliseStepText('i check out'));
});

test('countWords counts words, not characters', () => {
  assert.equal(countWords('I have 3 items'), 4);
  assert.equal(countWords('   '), 0);
});
