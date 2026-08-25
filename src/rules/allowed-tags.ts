import {getNodeType} from '../gherkin/keywords.ts';
import {taggedNodesOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';
import {mergeDefaults} from '../util/collections.ts';
import {at} from '../util/location.ts';

const name = 'allowed-tags';

interface AllowedTagsConfig {
  /** Tag names that are allowed, written exactly as they appear. */
  tags: string[];
  /** Regular expressions; a tag matching any of them is allowed. */
  patterns: string[];
}

const availableConfigs: AllowedTagsConfig = {tags: [], patterns: []};

const rule: LintRule = {
  name,
  availableConfigs,
  run(feature, _file, configuration) {
    if (feature === undefined) {
      return [];
    }

    const config = mergeDefaults(availableConfigs, configuration);
    const allowedTags = new Set(config.tags);
    const allowedPatterns = config.patterns.map((pattern) => new RegExp(pattern));
    const errors: RuleError[] = [];

    for (const {node} of taggedNodesOf(feature)) {
      for (const tag of node.tags) {
        const allowed =
          allowedTags.has(tag.name) || allowedPatterns.some((pattern) => pattern.test(tag.name));
        if (!allowed) {
          errors.push({
            message: `Not allowed tag ${tag.name} on ${getNodeType(node, feature.language)}`,
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
