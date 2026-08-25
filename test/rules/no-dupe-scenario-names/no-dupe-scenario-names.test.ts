import {beforeEach, test} from 'node:test';
import rule from '../../../src/rules/no-dupe-scenario-names.ts';
import {checkRule} from '../../helpers.ts';

const DIR = 'test/rules/no-dupe-scenario-names';

beforeEach(() => rule.reset?.());

test('accepts unique scenario names in one file', async () => {
  await checkRule(rule, 'no-dupe-scenario-names/UniqueScenarioNames.feature', {}, []);
});

test('accepts unique scenario names across files', async () => {
  await checkRule(rule, 'no-dupe-scenario-names/UniqueScenarioNamesAcrossFiles1.feature', {}, []);
  await checkRule(rule, 'no-dupe-scenario-names/UniqueScenarioNamesAcrossFiles2.feature', {}, []);
});

test('reports duplicate scenario names within one file', async () => {
  await checkRule(rule, 'no-dupe-scenario-names/DublicateScenarioNames.feature', {}, [
    {
      message: `Scenario name is already used in: ${DIR}/DublicateScenarioNames.feature:6`,
      line: 9,
    },
  ]);
});

test('reports duplicate scenario names across files by default', async () => {
  await checkRule(rule, 'no-dupe-scenario-names/DublicateScenarioNamesAcrossFiles1.feature', {}, []);
  await checkRule(rule, 'no-dupe-scenario-names/DublicateScenarioNamesAcrossFiles2.feature', {}, [
    {
      message: `Scenario name is already used in: ${DIR}/DublicateScenarioNamesAcrossFiles1.feature:6`,
      line: 6,
    },
    {
      message: `Scenario name is already used in: ${DIR}/DublicateScenarioNamesAcrossFiles1.feature:9`,
      line: 9,
    },
  ]);
});

test('ignores duplicates in other files when set to "in-feature"', async () => {
  await checkRule(rule, 'no-dupe-scenario-names/DublicateScenarioNamesAcrossFiles1.feature', 'in-feature', []);
  await checkRule(rule, 'no-dupe-scenario-names/DublicateScenarioNamesAcrossFiles2.feature', 'in-feature', []);
});
