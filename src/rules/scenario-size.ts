import {getNodeType} from '../gherkin/keywords.ts';
import {stepContainersOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';
import {mergeDefaults} from '../util/collections.ts';
import {at} from '../util/location.ts';

const name = 'scenario-size';

/** Maximum number of steps allowed in each kind of block. */
const availableConfigs = {
  'steps-length': {
    Background: 15,
    Scenario: 15,
  },
};

const rule: LintRule = {
  name,
  availableConfigs,
  run(feature, _file, configuration) {
    if (feature === undefined) {
      return [];
    }

    const config = mergeDefaults(availableConfigs, configuration);
    const errors: RuleError[] = [];

    for (const {node} of stepContainersOf(feature)) {
      const key = 'examples' in node ? 'Scenario' : 'Background';
      const maximum = config['steps-length'][key];
      if (typeof maximum === 'number' && node.steps.length > maximum) {
        errors.push({
          message: `Element ${getNodeType(node, feature.language)} too long: actual ${node.steps.length}, expected ${maximum}`,
          rule: name,
          ...at(node.location),
        });
      }
    }

    return errors;
  },
};

export default rule;
