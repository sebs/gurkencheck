import assert from 'node:assert/strict';
import {test} from 'node:test';
import rule from '../../../src/rules/no-dupe-file-names.ts';
import {runAcrossFiles} from '../../helpers.ts';

const DIR = 'no-dupe-file-names';
const ROOT = `test/rules/${DIR}`;

// https://github.com/gherkin-lint/gherkin-lint/issues/272
test('accepts file names that differ', async () => {
  const findings = await runAcrossFiles(rule, [
    `${DIR}/Login.feature`,
    `${DIR}/Logout.feature`,
  ]);
  assert.deepEqual(findings, []);
});

test('tells both files when a name is used in another folder', async () => {
  const findings = await runAcrossFiles(rule, [
    `${DIR}/Login.feature`,
    `${DIR}/nested/Login.feature`,
  ]);

  assert.deepEqual(findings, [
    {
      message: `File name is also used in: ${ROOT}/nested/Login.feature`,
      rule: 'no-dupe-file-names',
      line: 0,
      filePath: `${ROOT}/Login.feature`,
    },
    {
      message: `File name is also used in: ${ROOT}/Login.feature`,
      rule: 'no-dupe-file-names',
      line: 0,
      filePath: `${ROOT}/nested/Login.feature`,
    },
  ]);
});

test('the same file given twice is not a clash with itself', async () => {
  const findings = await runAcrossFiles(rule, [
    `${DIR}/Login.feature`,
    `${DIR}/Login.feature`,
  ]);
  assert.deepEqual(findings, []);
});
