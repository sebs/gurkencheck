import assert from 'node:assert/strict';
import {test} from 'node:test';
import {verifyConfiguration} from '../src/config-verifier.ts';
import {loadRules} from '../src/rules.ts';
import type {Configuration, LintRule} from '../src/types.ts';

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

test('takes a state written as a list of one', () => {
  assert.deepEqual(verify({'name-length': ['on'], 'no-empty-file': ['warn']} as unknown as Configuration), []);
});

test('reports an empty or overlong list once', () => {
  for (const config of [[], ['on', {}, 'extra']]) {
    const errors = verify({'name-length': config} as unknown as Configuration);
    assert.equal(errors.length, 1, JSON.stringify(config));
    assert.match(errors[0]!, /should be a state, or a list of a state and the rule's settings/u);
  }
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

test('explains that an always-on rule cannot be only a warning', () => {
  for (const config of ['warn', ['warn']]) {
    const errors = verify({'one-feature-per-file': config} as unknown as Configuration);
    assert.equal(errors.length, 1);
    assert.match(errors[0]!, /always fails the run/u);
  }
  assert.deepEqual(verify({'one-feature-per-file': 'on'} as Configuration), []);
});

test('still rejects a nonsense state for an always-on rule', () => {
  const errors = verify({'no-multiline-steps': 'yes'} as unknown as Configuration);
  assert.deepEqual(errors, [
    'Invalid rule configuration for "no-multiline-steps" - the rule is always on, so the config should be "on"',
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
    'Invalid rule configuration for "max-scenarios-per-file" - "maxScenarios" should be a whole number, 0 or more, not "0"',
  ]);
  assert.deepEqual(verify({indentation: ['on', {Step: 'two'}]}), [
    'Invalid rule configuration for "indentation" - "Step" should be a whole number, 0 or more, not "two"',
  ]);
});

test('checks nested settings too', () => {
  assert.deepEqual(verify({'scenario-size': ['on', {'steps-length': {Scenario: 'ten', Outline: 3}}]}), [
    'Invalid rule configuration for "scenario-size" - "steps-length" has no setting called "Outline". Available settings: "Background", "Scenario"',
    'Invalid rule configuration for "scenario-size" - "steps-length.Scenario" should be a whole number, 0 or more, not "ten"',
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

test('a count may not be negative or a fraction', () => {
  assert.deepEqual(verify({'name-length': ['on', {Step: -1, Feature: 2.5, Scenario: 0}]}), [
    'Invalid rule configuration for "name-length" - "Step" should be a whole number, 0 or more, not -1',
    'Invalid rule configuration for "name-length" - "Feature" should be a whole number, 0 or more, not 2.5',
  ]);
});

test('a tag listed without its @ is said to be no tag', () => {
  for (const rule of ['no-restricted-tags', 'allowed-tags']) {
    assert.deepEqual(verify({[rule]: ['on', {tags: ['@ok', 'wip']}]}), [
      `Invalid rule configuration for "${rule}" - "tags" holds "wip", which is not a tag: write it as "@wip"`,
    ]);
  }
});

test('an always-on rule takes no settings, and an empty list is said to be one', () => {
  assert.deepEqual(verify({'one-feature-per-file': ['on', {x: 1}]} as unknown as Configuration), [
    'Invalid rule configuration for "one-feature-per-file" - the rule has no settings and is always on, so the config should be "on"',
  ]);
  assert.deepEqual(verify({'one-feature-per-file': []} as unknown as Configuration), [
    `Invalid rule configuration for "one-feature-per-file" - the config should be a state, or a list of a state and the rule's settings`,
  ]);
  assert.deepEqual(verify({'one-feature-per-file': ['on']} as unknown as Configuration), []);
});

test('a number too large to read exactly is said to be too large', () => {
  assert.deepEqual(verify({'name-length': ['on', {Step: JSON.parse('1e400') as number, Feature: 9007199254740993}]}), [
    'Invalid rule configuration for "name-length" - "Step" is too large: it can be at most 9007199254740991',
    'Invalid rule configuration for "name-length" - "Feature" is too large: it can be at most 9007199254740991',
  ]);
});

test('a misspelt rule name gets the one meant', () => {
  assert.deepEqual(verify({'no-trailing-space': 'on'} as unknown as Configuration), [
    'Rule "no-trailing-space" does not exist. Did you mean "no-trailing-spaces"?',
  ]);
});

test('a tag with spaces, or with no name, is said to be no tag', () => {
  const prefix = 'Invalid rule configuration for "no-restricted-tags" - "tags" holds';
  assert.deepEqual(verify({'no-restricted-tags': ['on', {tags: [' @wip', '@a b', '@']}]}), [
    `${prefix} " @wip", which is not a tag: write it as "@wip"`,
    `${prefix} "@a b", which is not a tag: a tag is @ followed by a name with no spaces`,
    `${prefix} "@", which is not a tag: a tag is @ followed by a name with no spaces`,
  ]);
});

test('a single value wrapped in a list is said to be a list', () => {
  assert.deepEqual(verify({'no-dupe-scenario-names': ['on', ['anywhere']]} as unknown as Configuration), [
    'Invalid rule configuration for "no-dupe-scenario-names" - the rule takes a single value, not a list: write "anywhere" rather than ["anywhere"]',
  ]);
});

test('the directive checks take a state and nothing else', () => {
  assert.deepEqual(verify({'unknown-directive': 'off', 'unknown-rule-in-directive': ['on']} as unknown as Configuration), []);
  assert.equal(verify({'unknown-directive': ['on', {}]} as unknown as Configuration).length, 1);
});

test('a long value of the wrong type is quoted short', () => {
  const [error] = verify({'name-length': ['on', {Step: 'x'.repeat(100000)}]} as unknown as Configuration);
  assert.ok(error!.length < 300, `message is ${error!.length} long`);
  assert.match(error!, /…$/u);
});

test('a directive check given a nonsense state is not told it has no settings', () => {
  for (const config of ['ON', []]) {
    assert.deepEqual(verify({'unknown-directive': config} as unknown as Configuration), [
      'Invalid rule configuration for "unknown-directive" - the config should be "on", "warn" or "off"',
    ]);
  }
  assert.deepEqual(verify({'unknown-directive': ['on', {}]} as unknown as Configuration), [
    'Invalid rule configuration for "unknown-directive" - the check has no settings, so the config should be "on", "warn" or "off"',
  ]);
});

test('a custom rule s settings check that throws or hands back no list is the rule s problem', () => {
  const custom = (verifySettings: (settings: Record<string, unknown>) => unknown) =>
    new Map([
      ...rules,
      ['custom', {name: 'custom', run: () => [], availableConfigs: {pattern: ''}, verifySettings} as unknown as LintRule],
    ]);
  const config = {custom: ['on', {pattern: '(unclosed'}]} as unknown as Configuration;
  assert.deepEqual(
    verifyConfiguration(config, custom((settings) => [new RegExp(settings['pattern'] as string)].length && [])),
    ['Invalid rule configuration for "custom" - the rule\'s settings check failed: Invalid regular expression: /(unclosed/: Unterminated group'],
  );
  assert.deepEqual(verifyConfiguration(config, custom(() => undefined)), [], 'nothing back is nothing wrong');
  assert.deepEqual(verifyConfiguration(config, custom(() => 'bad')), [
    'Invalid rule configuration for "custom" - the rule\'s settings check returned string instead of a list of problems',
  ]);
});
