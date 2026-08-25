import {getNodeType} from '../gherkin/keywords.ts';
import type {LintRule, RuleError} from '../types.ts';
import {mergeDefaults} from '../util/collections.ts';

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

    for (const child of feature.children) {
      const scenario = child.scenario;
      if (scenario === undefined) {
        continue;
      }
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
            line: scenario.location.line,
          });
        }
      }
    }

    return errors;
  },
};

export default rule;
