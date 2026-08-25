import {beforeEach, test} from 'node:test';
import rule from '../../../src/rules/no-dupe-file-names.ts';
import {checkRule} from '../../helpers.ts';

const DIR = 'test/rules/no-dupe-file-names';

beforeEach(() => rule.reset?.());

// https://github.com/gherkin-lint/gherkin-lint/issues/272
test('accepts file names that differ', async () => {
  await checkRule(rule, 'no-dupe-file-names/Login.feature', {}, []);
  await checkRule(rule, 'no-dupe-file-names/Logout.feature', {}, []);
});

test('reports the same file name used in another folder', async () => {
  await checkRule(rule, 'no-dupe-file-names/Login.feature', {}, []);
  await checkRule(rule, 'no-dupe-file-names/nested/Login.feature', {}, [
    {message: `File name is already used in: ${DIR}/Login.feature`, line: 0},
  ]);
});

test('names every earlier file when the same name comes round again', async () => {
  await checkRule(rule, 'no-dupe-file-names/Login.feature', {}, []);
  await checkRule(rule, 'no-dupe-file-names/nested/Login.feature', {}, [
    {message: `File name is already used in: ${DIR}/Login.feature`, line: 0},
  ]);
  await checkRule(rule, 'no-dupe-file-names/Login.feature', {}, [
    {
      message: `File name is already used in: ${DIR}/Login.feature, ${DIR}/nested/Login.feature`,
      line: 0,
    },
  ]);
});
