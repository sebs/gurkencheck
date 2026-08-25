import {getNodeType} from '../gherkin/keywords.ts';
import {taggedNodesOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';
import {mergeDefaults} from '../util/collections.ts';
import {at} from '../util/location.ts';

const name = 'no-restricted-tags';

interface RestrictedTagsConfig {
  /** Tag names that are forbidden, written exactly as they appear. */
  tags: string[];
  /** Regular expressions; a tag matching any of them is forbidden. */
  patterns: string[];
}

const availableConfigs: RestrictedTagsConfig = {tags: [], patterns: []};

const rule: LintRule = {
  name,
  availableConfigs,
  run(feature, _file, configuration) {
    if (feature === undefined) {
      return [];
    }

    const config = mergeDefaults(availableConfigs, configuration);
    const forbiddenTags = new Set(config.tags);
    const forbiddenPatterns = config.patterns.map((pattern) => new RegExp(pattern));
    const errors: RuleError[] = [];

    for (const {node} of taggedNodesOf(feature)) {
      const nodeType = getNodeType(node, feature.language);
      for (const tag of node.tags) {
        const forbidden =
          forbiddenTags.has(tag.name) || forbiddenPatterns.some((pattern) => pattern.test(tag.name));
        if (forbidden) {
          errors.push({
            message: `Forbidden tag ${tag.name} on ${nodeType}`,
            rule: name,
            ...at(tag.location),
          });
        }
      }
    }
    return errors;
  },
};

export default rule;
