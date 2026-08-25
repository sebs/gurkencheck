import assert from 'node:assert/strict';
import {test} from 'node:test';
import {camelCase, kebabCase, pascalCase, snakeCase, titleCase, words} from '../../src/util/case.ts';

test('words splits on separators and case changes', () => {
  assert.deepEqual(words('my-fancy_feature file'), ['my', 'fancy', 'feature', 'file']);
  assert.deepEqual(words('PascalCaseWithFiveWords'), [
    'Pascal',
    'Case',
    'With',
    'Five',
    'Words',
  ]);
  assert.deepEqual(words('XMLHttpRequest'), ['XML', 'Http', 'Request']);
  assert.deepEqual(words('version2Point3'), ['version2', 'Point3']);
});

const SAMPLES = ['PascalCaseWithFiveWords', 'pascal case with five words', 'pascal_case_with_five_words'];

for (const sample of SAMPLES) {
  test(`converts "${sample}" into every style`, () => {
    assert.equal(pascalCase(sample), 'PascalCaseWithFiveWords');
    assert.equal(titleCase(sample), 'Pascal Case With Five Words');
    assert.equal(camelCase(sample), 'pascalCaseWithFiveWords');
    assert.equal(kebabCase(sample), 'pascal-case-with-five-words');
    assert.equal(snakeCase(sample), 'pascal_case_with_five_words');
  });
}

test('handles an empty name', () => {
  assert.equal(pascalCase(''), '');
  assert.equal(kebabCase(''), '');
});
