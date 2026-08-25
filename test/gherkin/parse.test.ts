import assert from 'node:assert/strict';
import {test} from 'node:test';
import {detectLanguage, getDialect, isKnownLanguage} from '../../src/gherkin/dialects.ts';
import {getNeutralKeyword, getNodeType} from '../../src/gherkin/keywords.ts';
import {parseFeature, toLines} from '../../src/gherkin/parse.ts';

test('parses a well formed feature', () => {
  const {feature, errors} = parseFeature(
    'x.feature',
    'Feature: A\n\n  Scenario: B\n    Given something\n',
  );
  assert.deepEqual(errors, []);
  assert.equal(feature?.name, 'A');
  assert.equal(feature?.children.length, 1);
});

test('an empty file yields no feature and no errors', () => {
  const {feature, errors} = parseFeature('x.feature', '');
  assert.equal(feature, undefined);
  assert.deepEqual(errors, []);
});

test('splits on all three line endings', () => {
  assert.deepEqual(toLines('a\r\nb\rc\nd'), ['a', 'b', 'c', 'd']);
});

test('detects the language header', () => {
  assert.equal(detectLanguage(['# language: de', 'Funktionalität: A']), 'de');
  assert.equal(detectLanguage(['#language:de']), 'de');
  assert.equal(detectLanguage(['Feature: A', '# language: de']), 'en');
  assert.equal(detectLanguage(['# language: klingon']), 'en');
});

test('knows which languages exist', () => {
  assert.ok(isKnownLanguage('de'));
  assert.ok(!isKnownLanguage('klingon'));
});

test('an unknown language falls back to English', () => {
  assert.equal(getDialect('klingon').feature[0], 'Feature');
});

test('maps localised keywords back to neutral ones', () => {
  assert.equal(getNeutralKeyword({keyword: 'Funktionalität'}, 'de'), 'feature');
  assert.equal(getNeutralKeyword({keyword: 'Szenariogrundriss'}, 'de'), 'scenariooutline');
  assert.equal(getNeutralKeyword({keyword: 'Angenommen '}, 'de'), 'given');
  assert.equal(getNeutralKeyword({keyword: 'Nonsense'}, 'de'), '');
});

test('names node types for messages', () => {
  assert.equal(getNodeType({keyword: 'Scenario Outline'}, 'en'), 'Scenario Outline');
  assert.equal(getNodeType({keyword: 'Given '}, 'en'), 'Step');
  assert.equal(getNodeType({keyword: 'Nonsense'}, 'en'), '');
});

test('recognises a localised keyword when classifying a parse failure', () => {
  const source = [
    '# language: de',
    'Funktionalität: A',
    '',
    '  Szenario: S',
    '    Angenommen etwas',
    '',
    'Funktionalität: B',
    '',
  ].join('\n');
  const {errors} = parseFeature('x.feature', source);
  assert.deepEqual(errors, [
    {
      line: 7,
      column: 1,
      message: 'Multiple "Feature" definitions in the same file are disallowed',
      rule: 'one-feature-per-file',
    },
  ]);
});

test('localises the multiline step message', () => {
  const source = [
    '# language: de',
    'Funktionalität: A',
    '  Szenario: B',
    '    Angenommen etwas',
    '    das ist mehrzeilig',
    '',
  ].join('\n');
  const {errors} = parseFeature('x.feature', source);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]!.rule, 'no-multiline-steps');
  assert.match(errors[0]!.message, /"Angenommen", "Wenn", "Dann", "Und" or "Aber"/u);
});

test('falls back to the parser message for anything unrecognised', () => {
  const {errors} = parseFeature('x.feature', '# language: klingon-nope\nFeature: A\n');
  assert.equal(errors.length, 1);
  assert.equal(errors[0]!.rule, 'unexpected-error');
  assert.match(errors[0]!.message, /Language not supported: klingon-nope/u);
});

// https://github.com/gherkin-lint/gherkin-lint/issues/158
test('tells a misplaced Background apart from a second one', () => {
  const misplaced = parseFeature(
    'x.feature',
    ['Feature: F', '', 'Scenario: S', '  Then step', '', 'Background:', '  Given a', ''].join('\n'),
  );
  assert.deepEqual(misplaced.errors, [
    {
      line: 6,
      column: 1,
      message: 'A "Background" must come before the Scenarios it applies to',
      rule: 'background-before-scenarios',
    },
  ]);

  const duplicate = parseFeature(
    'x.feature',
    [
      'Feature: F',
      '',
      'Background:',
      '  Given a',
      '',
      'Background:',
      '  Given b',
      '',
      'Scenario: S',
      '  Then step',
      '',
    ].join('\n'),
  );
  assert.equal(duplicate.errors[0]?.rule, 'up-to-one-background-per-file');
});

test('recognises a misplaced Background in another language', () => {
  const source = [
    '# language: de',
    'Funktionalität: F',
    '',
    '  Szenario: S',
    '    Dann etwas',
    '',
    'Grundlage:',
    '  Angenommen etwas',
    '',
  ].join('\n');
  assert.equal(parseFeature('x.feature', source).errors[0]?.rule, 'background-before-scenarios');
});
