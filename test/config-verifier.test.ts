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

test('reports a state that is not one of the three', () => {
  assert.deepEqual(verify({'no-empty-file': 'yes'} as unknown as Configuration), [
    'Invalid rule configuration for "no-empty-file" - the config should be "on", "warn" or "off"',
  ]);
});

// https://github.com/gherkin-lint/gherkin-lint/issues/340
// https://github.com/gherkin-lint/gherkin-lint/issues/21
test('accepts warn as a state, on its own or with settings', () => {
  assert.deepEqual(verify({'no-empty-file': 'warn'}), []);
  assert.deepEqual(verify({'name-length': ['warn', {Feature: 50}]}), []);
});

test('reports a bad state in the array form', () => {
  const errors = verify({'name-length': ['yes', {Feature: 50}]} as unknown as Configuration);
  assert.deepEqual(errors, [
    'Invalid rule configuration for "name-length" - the first part of the config should be "on", "warn" or "off"',
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
    'Invalid rule configuration for "no-multiline-steps" - the config should be "on", "warn" or "off"',
  ]);
});

test('reports a setting of the wrong type', () => {
  assert.deepEqual(verify({'allowed-tags': ['on', {patterns: '^@w'}]}), [
    'Invalid rule configuration for "allowed-tags" - "patterns" should be a list of strings, not "^@w"',
  ]);
  assert.deepEqual(verify({'required-tags': ['on', {tags: '@ab'}]}), [
    'Invalid rule configuration for "required-tags" - "tags" should be a list of strings, not "@ab"',
  ]);
  assert.deepEqual(verify({'max-scenarios-per-file': ['on', {maxScenarios: '0'}]}), [
    'Invalid rule configuration for "max-scenarios-per-file" - "maxScenarios" should be a number, not "0"',
  ]);
  assert.deepEqual(verify({indentation: ['on', {Step: 'two'}]}), [
    'Invalid rule configuration for "indentation" - "Step" should be a number, not "two"',
  ]);
});

test('checks nested settings too', () => {
  assert.deepEqual(verify({'scenario-size': ['on', {'steps-length': {Scenario: 'ten', Outline: 3}}]}), [
    'Invalid rule configuration for "scenario-size" - "steps-length" has no setting called "Outline". Available settings: "Background", "Scenario"',
    'Invalid rule configuration for "scenario-size" - "steps-length.Scenario" should be a number, not "ten"',
  ]);
});

test('reports a pattern that is not a regular expression once, before linting', () => {
  const [problem, ...rest] = verify({'no-restricted-tags': ['on', {patterns: ['[unclosed']}]});
  assert.deepEqual(rest, []);
  assert.match(problem!, /"patterns" holds "\[unclosed", which is not a regular expression/u);
  assert.equal(verify({'no-restricted-patterns': ['on', {Global: ['(']}]}).length, 1);
  assert.equal(verify({'required-tags': ['on', {tags: ['*']}]}).length, 1);
});

test('reports a value outside a fixed set of choices', () => {
  assert.deepEqual(verify({indentation: ['on', {character: 'tabs'}]}), [
    'Invalid rule configuration for "indentation" - "character" should be "any", "space" or "tab", not "tabs"',
  ]);
  assert.equal(verify({'file-name': ['on', {style: 'Kebab'}]}).length, 1);
});

test('reports settings given to a built-in rule that has none', () => {
  assert.deepEqual(verify({'no-trailing-spaces': ['on', 'garbage']}), [
    'Invalid rule configuration for "no-trailing-spaces" - the rule has no settings, so the config should be "on", "warn" or "off"',
  ]);
});
