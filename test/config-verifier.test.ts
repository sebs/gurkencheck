import assert from 'node:assert/strict';
import {test} from 'node:test';
import {verifyConfiguration} from '../src/config-verifier.ts';
import {loadRules} from '../src/rules.ts';
import type {Configuration} from '../src/types.ts';

const rules = await loadRules();

function verify(configuration: Configuration): string[] {
  return verifyConfiguration(configuration, rules);
}

test('accepts a rule switched on or off', () => {
  assert.deepEqual(verify({'no-empty-file': 'on', 'no-unnamed-features': 'off'}), []);
});

test('accepts a rule with settings', () => {
  assert.deepEqual(verify({'name-length': ['on', {Feature: 50}]}), []);
});

test('accepts a rule with a value from a fixed list', () => {
  assert.deepEqual(verify({'new-line-at-eof': ['on', 'yes']}), []);
});

test('reports an unknown rule', () => {
  assert.deepEqual(verify({'not-a-rule': 'on'} as Configuration), [
    'Rule "not-a-rule" does not exist',
  ]);
});

test('reports a state that is neither on nor off', () => {
  assert.deepEqual(verify({'no-empty-file': 'yes'} as unknown as Configuration), [
    'Invalid rule configuration for "no-empty-file" - the config should be "on" or "off"',
  ]);
});

test('reports a bad state in the array form', () => {
  const errors = verify({'name-length': ['yes', {Feature: 50}]} as unknown as Configuration);
  assert.deepEqual(errors, [
    'Invalid rule configuration for "name-length" - the first part of the config should be "on" or "off"',
  ]);
});

test('reports an array config with the wrong number of parts', () => {
  const errors = verify({'name-length': ['on']} as unknown as Configuration);
  assert.match(errors[0]!, /should have exactly 2 parts/u);
});

test('reports a setting the rule does not have', () => {
  const errors = verify({'name-length': ['on', {Nonsense: 50}]});
  assert.match(errors[0]!, /has no setting called "Nonsense"/u);
  assert.match(errors[0]!, /"Feature", "Rule", "Step", "Scenario"/u);
});

test('reports a value outside a rule s fixed list', () => {
  const errors = verify({'new-line-at-eof': ['on', 'maybe']});
  assert.match(errors[0]!, /"maybe" is not one of the allowed values: "yes", "no"/u);
});

test('reports settings given as something other than an object', () => {
  const errors = verify({'name-length': ['on', 70]});
  assert.match(errors[0]!, /should be an object/u);
});
