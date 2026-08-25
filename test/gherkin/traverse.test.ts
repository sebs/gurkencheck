import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseFeature} from '../../src/gherkin/parse.ts';
import {
  backgroundsOf,
  rulesOf,
  scenariosOf,
  stepContainersOf,
} from '../../src/gherkin/traverse.ts';

/** A feature with a background and scenario both outside and inside a Rule. */
const SOURCE = [
  'Feature: A',
  '',
  '  Background: top level background',
  '    Given something',
  '',
  '  Scenario: top level scenario',
  '    Given something',
  '',
  '  Rule: a rule',
  '',
  '    Background: rule background',
  '      Given something',
  '',
  '    Scenario: rule scenario',
  '      Given something',
  '',
].join('\n');

const {feature} = parseFeature('x.feature', SOURCE);
assert.ok(feature, 'the fixture should parse');

test('rulesOf yields each Rule', () => {
  assert.deepEqual([...rulesOf(feature)].map((rule) => rule.name), ['a rule']);
});

test('scenariosOf reaches into Rules and reports the containing Rule', () => {
  assert.deepEqual(
    [...scenariosOf(feature)].map(({scenario, rule}) => [scenario.name, rule?.name]),
    [
      ['top level scenario', undefined],
      ['rule scenario', 'a rule'],
    ],
  );
});

test('backgroundsOf reaches into Rules', () => {
  assert.deepEqual(
    [...backgroundsOf(feature)].map(({background, rule}) => [background.name, rule?.name]),
    [
      ['top level background', undefined],
      ['rule background', 'a rule'],
    ],
  );
});

test('stepContainersOf yields every block holding steps', () => {
  assert.deepEqual([...stepContainersOf(feature)].map(({node}) => node.name), [
    'top level background',
    'top level scenario',
    'rule background',
    'rule scenario',
  ]);
});

test('a feature with no Rules yields no Rules', () => {
  const plain = parseFeature('y.feature', 'Feature: B\n\n  Scenario: C\n    Given x\n').feature;
  assert.ok(plain);
  assert.deepEqual([...rulesOf(plain)], []);
  assert.deepEqual([...backgroundsOf(plain)], []);
});
