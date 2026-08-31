import assert from 'node:assert/strict';
import {test} from 'node:test';
import rule from '../../../src/rules/no-dupe-scenario-names.ts';
import {runAcrossFiles} from '../../helpers.ts';

const DIR = 'no-dupe-scenario-names';
const ROOT = `test/rules/${DIR}`;

/** Just the parts a reader of the report cares about. */
function reported(findings: {filePath?: string; message: string; line: number}[]) {
  return findings.map(({filePath, message, line}) => ({filePath, message, line}));
}

test('accepts unique scenario names in one file', async () => {
  assert.deepEqual(await runAcrossFiles(rule, [`${DIR}/UniqueScenarioNames.feature`]), []);
});

test('accepts unique scenario names across files', async () => {
  const findings = await runAcrossFiles(rule, [
    `${DIR}/UniqueScenarioNamesAcrossFiles1.feature`,
    `${DIR}/UniqueScenarioNamesAcrossFiles2.feature`,
  ]);
  assert.deepEqual(findings, []);
});

test('tells both scenarios when a name is used twice in one file', async () => {
  const findings = await runAcrossFiles(rule, [`${DIR}/DublicateScenarioNames.feature`]);

  assert.deepEqual(reported(findings), [
    {
      filePath: `${ROOT}/DublicateScenarioNames.feature`,
      message: `Scenario name is also used in: ${ROOT}/DublicateScenarioNames.feature:9`,
      line: 6,
    },
    {
      filePath: `${ROOT}/DublicateScenarioNames.feature`,
      message: `Scenario name is also used in: ${ROOT}/DublicateScenarioNames.feature:6`,
      line: 9,
    },
  ]);
});

test('reports duplicate scenario names across files by default', async () => {
  const findings = await runAcrossFiles(rule, [
    `${DIR}/DublicateScenarioNamesAcrossFiles1.feature`,
    `${DIR}/DublicateScenarioNamesAcrossFiles2.feature`,
  ]);

  assert.deepEqual(reported(findings), [
    {
      filePath: `${ROOT}/DublicateScenarioNamesAcrossFiles1.feature`,
      message: `Scenario name is also used in: ${ROOT}/DublicateScenarioNamesAcrossFiles2.feature:6`,
      line: 6,
    },
    {
      filePath: `${ROOT}/DublicateScenarioNamesAcrossFiles2.feature`,
      message: `Scenario name is also used in: ${ROOT}/DublicateScenarioNamesAcrossFiles1.feature:6`,
      line: 6,
    },
    {
      filePath: `${ROOT}/DublicateScenarioNamesAcrossFiles1.feature`,
      message: `Scenario name is also used in: ${ROOT}/DublicateScenarioNamesAcrossFiles2.feature:9`,
      line: 9,
    },
    {
      filePath: `${ROOT}/DublicateScenarioNamesAcrossFiles2.feature`,
      message: `Scenario name is also used in: ${ROOT}/DublicateScenarioNamesAcrossFiles1.feature:9`,
      line: 9,
    },
  ]);
});

test('ignores duplicates in other files when set to "in-feature"', async () => {
  const findings = await runAcrossFiles(
    rule,
    [
      `${DIR}/DublicateScenarioNamesAcrossFiles1.feature`,
      `${DIR}/DublicateScenarioNamesAcrossFiles2.feature`,
    ],
    'in-feature',
  );
  assert.deepEqual(findings, []);
});

test('"in-feature" still reports a name used twice within one file', async () => {
  const findings = await runAcrossFiles(
    rule,
    [`${DIR}/DublicateScenarioNames.feature`],
    'in-feature',
  );

  assert.deepEqual(
    reported(findings).map((finding) => finding.line),
    [6, 9],
  );
});
