import type {Location} from '@cucumber/messages';
import {rulesOf, stepContainersOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';
import {mergeDefaults} from '../util/collections.ts';
import {at} from '../util/location.ts';

const name = 'name-length';

const GRAPHEMES = new Intl.Segmenter(undefined, {granularity: 'grapheme'});

/** How many characters a reader sees in `text`. */
function graphemeCount(text: string): number {
  let count = 0;
  for (const _ of GRAPHEMES.segment(text)) {
    count++;
  }
  return count;
}

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
      // Characters as they are seen, not the UTF-16 units .length counts,
      // nor code points: é written as e and an accent is one, and so is a
      // family emoji joined from several.
      const length = graphemeCount(text);
      // A limit of 0 turns the check off for that kind of name, for teams that
      // want a limit on scenario names but not on step text, or the reverse.
      if (maximum > 0 && text !== '' && length > maximum) {
        errors.push({
          message: `${type} name is too long. Length of ${length} is longer than the maximum allowed: ${maximum}`,
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
