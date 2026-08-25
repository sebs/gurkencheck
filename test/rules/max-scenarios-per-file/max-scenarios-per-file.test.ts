import {test} from 'node:test';
import rule from '../../../src/rules/max-scenarios-per-file.ts';
import {checkRule} from '../../helpers.ts';

const tooMany = (count: number) => ({
  message: `Number of scenarios exceeds maximum: ${count}/10`,
  line: 0,
});

test('accepts files within the limit', () => {
  for (const fixture of ['CorrectNumber', 'CorrectNumberExamples', 'CorrectNumberMixed']) {
    checkRule(rule, `max-scenarios-per-file/${fixture}.feature`, {maxScenarios: 10}, []);
  }
});

test('reports files with too many scenarios', () => {
  checkRule(rule, 'max-scenarios-per-file/TooManyScenarios.feature', {maxScenarios: 10}, [
    tooMany(11),
  ]);
});

test('counts every examples row when countOutlineExamples is on', () => {
  checkRule(rule, 'max-scenarios-per-file/TooManyExamples.feature', {maxScenarios: 10}, [
    tooMany(11),
  ]);
});

test('counts an outline once when countOutlineExamples is off', () => {
  checkRule(
    rule,
    'max-scenarios-per-file/TooManyExamples.feature',
    {maxScenarios: 10, countOutlineExamples: false},
    [],
  );
  checkRule(
    rule,
    'max-scenarios-per-file/TooManyScenarios.feature',
    {maxScenarios: 10, countOutlineExamples: false},
    [tooMany(11)],
  );
});
