import type {Location} from '@cucumber/messages';
import {rulesOf, stepContainersOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';
import {mergeDefaults} from '../util/collections.ts';
import {at} from '../util/location.ts';

const name = 'name-length';

/** Maximum number of characters allowed in each kind of name; 0 means no limit. */
const availableConfigs = {
  Feature: 70,
  Rule: 70,
  Step: 70,
  Scenario: 70,
};

type NameLengthConfig = typeof availableConfigs;

const rule: LintRule = {
  name,
  availableConfigs,
  run(feature, _file, configuration) {
    if (feature === undefined) {
      return [];
    }

    const config = mergeDefaults(availableConfigs, configuration);
    const errors: RuleError[] = [];

    const test = (text: string, location: Location, type: keyof NameLengthConfig): void => {
      const maximum = config[type];
      // A limit of 0 turns the check off for that kind of name, for teams that
      // want a limit on scenario names but not on step text, or the reverse.
      if (maximum > 0 && text !== '' && text.length > maximum) {
        errors.push({
          message: `${type} name is too long. Length of ${text.length} is longer than the maximum allowed: ${maximum}`,
          rule: name,
          ...at(location),
        });
      }
    };

    test(feature.name, feature.location, 'Feature');

    for (const featureRule of rulesOf(feature)) {
      test(featureRule.name, featureRule.location, 'Rule');
    }

    for (const {node} of stepContainersOf(feature)) {
      // Only Scenarios have a name worth checking; Backgrounds rarely have one.
      if ('examples' in node) {
        test(node.name, node.location, 'Scenario');
      }
      for (const step of node.steps) {
        test(step.text, step.location, 'Step');
      }
    }

    return errors;
  },
};

export default rule;
