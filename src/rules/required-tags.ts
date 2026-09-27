import {getNodeType} from '../gherkin/keywords.ts';
import {scenariosOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';
import {mergeDefaults} from '../util/collections.ts';
import {at} from '../util/location.ts';
import {invalidPatterns} from '../util/patterns.ts';

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
  verifySettings: (settings) => invalidPatterns('tags', settings['tags']),
  run(feature, _file, configuration) {
    if (feature === undefined) {
      return [];
    }

    const config = mergeDefaults(availableConfigs, configuration);
    const errors: RuleError[] = [];

    for (const {scenario, rule: parent} of scenariosOf(feature)) {
      if (config.ignoreUntagged && scenario.tags.length === 0) {
        continue;
      }

      // A scenario runs with the tags of its Feature and Rule as well as its
      // own, and each Examples table's rows with that table's tags on top.
      // Asking for the tag to be repeated on the scenario would only have
      // no-superfluous-tags complain about it.
      const inherited = [...feature.tags, ...(parent?.tags ?? []), ...scenario.tags];
      const tagSets =
        scenario.examples.length === 0
          ? [inherited]
          : scenario.examples.map((examples) => [...inherited, ...examples.tags]);

      const scenarioType = getNodeType(scenario, feature.language);
      for (const required of config.tags) {
        const pattern = new RegExp(required);
        const found = tagSets.every((tags) => tags.some((tag) => pattern.test(tag.name)));
        if (!found) {
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
