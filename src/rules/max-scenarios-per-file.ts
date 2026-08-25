import {scenariosOf} from '../gherkin/traverse.ts';
import type {LintRule} from '../types.ts';
import {mergeDefaults} from '../util/collections.ts';

const name = 'max-scenarios-per-file';

const availableConfigs = {
  /** How many Scenarios a single file may contain. */
  maxScenarios: 10,
  /** Whether each row of an Examples table counts as its own Scenario. */
  countOutlineExamples: true,
};

const rule: LintRule = {
  name,
  availableConfigs,
  run(feature, _file, configuration) {
    if (feature === undefined) {
      return [];
    }

    const config = mergeDefaults(availableConfigs, configuration);
    let count = 0;

    for (const {scenario} of scenariosOf(feature)) {
      if (config.countOutlineExamples && scenario.examples.length > 0) {
        for (const examples of scenario.examples) {
          count += examples.tableBody.length;
        }
      } else {
        count += 1;
      }
    }

    if (count <= config.maxScenarios) {
      return [];
    }
    return [
      {
        message: `Number of scenarios exceeds maximum: ${count}/${config.maxScenarios}`,
        rule: name,
        line: 0,
      },
    ];
  },
};

export default rule;
