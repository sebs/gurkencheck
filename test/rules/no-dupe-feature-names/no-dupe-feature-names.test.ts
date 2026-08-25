import {beforeEach, test} from 'node:test';
import rule from '../../../src/rules/no-dupe-feature-names.ts';
import {checkRule} from '../../helpers.ts';

const DIR = 'test/rules/no-dupe-feature-names';

beforeEach(() => rule.reset?.());

test('accepts unique feature names', async () => {
  await checkRule(rule, 'no-dupe-feature-names/NoViolations.feature', {}, []);
});

test('reports every file a feature name has already been used in', async () => {
  await checkRule(rule, 'no-dupe-feature-names/DuplicateNameFeature1.feature', {}, []);
  await checkRule(rule, 'no-dupe-feature-names/DuplicateNameFeature2.feature', {}, [
    {
      message: `Feature name is already used in: ${DIR}/DuplicateNameFeature1.feature`,
      line: 3,
    },
  ]);
  await checkRule(rule, 'no-dupe-feature-names/DuplicateNameFeature3.feature', {}, [
    {
      message:
        'Feature name is already used in: ' +
        `${DIR}/DuplicateNameFeature1.feature, ${DIR}/DuplicateNameFeature2.feature`,
      line: 1,
    },
  ]);
});
