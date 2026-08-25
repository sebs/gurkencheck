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

// https://github.com/gherkin-lint/gherkin-lint/issues/264
test('accepts the always-on rules being listed in the configuration', () => {
  assert.deepEqual(
    verify({
      'one-feature-per-file': 'on',
      'up-to-one-background-per-file': 'on',
      'no-multiline-steps': 'on',
      'no-tags-on-backgrounds': 'on',
    } as Configuration),
    [],
  );
});

test('explains that an always-on rule cannot be turned off', () => {
  const errors = verify({'one-feature-per-file': 'off'} as Configuration);
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /always on/u);
  assert.match(errors[0]!, /nothing to switch off/u);
});

test('still rejects a nonsense state for an always-on rule', () => {
  const errors = verify({'no-multiline-steps': 'yes'} as unknown as Configuration);
  assert.deepEqual(errors, [
    'Invalid rule configuration for "no-multiline-steps" - the config should be "on" or "off"',
  ]);
});
