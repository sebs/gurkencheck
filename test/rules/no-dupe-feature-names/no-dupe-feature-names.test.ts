import assert from 'node:assert/strict';
import {test} from 'node:test';
import rule from '../../../src/rules/no-dupe-feature-names.ts';
import {runAcrossFiles} from '../../helpers.ts';

const DIR = 'no-dupe-feature-names';

test('accepts unique feature names', async () => {
  assert.deepEqual(await runAcrossFiles(rule, [`${DIR}/NoViolations.feature`]), []);
});

test('tells every file sharing a feature name about the others', async () => {
  const findings = await runAcrossFiles(rule, [
    `${DIR}/DuplicateNameFeature1.feature`,
    `${DIR}/DuplicateNameFeature2.feature`,
    `${DIR}/DuplicateNameFeature3.feature`,
  ]);

  assert.deepEqual(
    findings.map(({filePath, message, line}) => ({filePath, message, line})),
    [
      {
        filePath: `test/rules/${DIR}/DuplicateNameFeature1.feature`,
        message: `Feature name is also used in: test/rules/${DIR}/DuplicateNameFeature2.feature, test/rules/${DIR}/DuplicateNameFeature3.feature`,
        line: 1,
      },
      {
        filePath: `test/rules/${DIR}/DuplicateNameFeature2.feature`,
        message: `Feature name is also used in: test/rules/${DIR}/DuplicateNameFeature1.feature, test/rules/${DIR}/DuplicateNameFeature3.feature`,
        line: 3,
      },
      {
        filePath: `test/rules/${DIR}/DuplicateNameFeature3.feature`,
        message: `Feature name is also used in: test/rules/${DIR}/DuplicateNameFeature1.feature, test/rules/${DIR}/DuplicateNameFeature2.feature`,
        line: 1,
      },
    ],
  );
});

// The old rule reported against whichever file came second, so reversing the
// order moved the finding to a different file.
test('reports the same thing whatever order the files come in', async () => {
  const files = [`${DIR}/DuplicateNameFeature1.feature`, `${DIR}/DuplicateNameFeature2.feature`];
  const forwards = await runAcrossFiles(rule, files);
  const backwards = await runAcrossFiles(rule, [...files].reverse());

  const sorted = (findings: {filePath?: string; message: string}[]) =>
    [...findings].sort((a, b) => (a.filePath ?? '').localeCompare(b.filePath ?? ''));

  assert.deepEqual(
    sorted(forwards).map(({filePath, message}) => ({filePath, message})),
    sorted(backwards).map(({filePath, message}) => ({filePath, message})),
  );
});
