import {getNodeType} from '../gherkin/keywords.ts';
import {scenariosOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';
import {mergeDefaults} from '../util/collections.ts';
import {at} from '../util/location.ts';

const name = 'required-tags';

interface RequiredTagsConfig {
  /** Regular expressions; each one must be matched by at least one tag. */
  tags: string[];
  /** When true, Scenarios with no tags at all are left alone. */
  ignoreUntagged: boolean;
}

const availableConfigs: RequiredTagsConfig = {tags: [], ignoreUntagged: true};

const rule: LintRule = {
  name,
  availableConfigs,
  run(feature, _file, configuration) {
    if (feature === undefined) {
      return [];
    }

    const config = mergeDefaults(availableConfigs, configuration);
    const errors: RuleError[] = [];

    for (const {scenario} of scenariosOf(feature)) {
      if (config.ignoreUntagged && scenario.tags.length === 0) {
        continue;
      }

      const scenarioType = getNodeType(scenario, feature.language);
      for (const required of config.tags) {
        const pattern = new RegExp(required);
        if (!scenario.tags.some((tag) => pattern.test(tag.name))) {
          errors.push({
            message: `No tag found matching ${required} for ${scenarioType}`,
            rule: name,
            ...at(scenario.location),
          });
        }
      }
    }

    return errors;
  },
};

export default rule;
