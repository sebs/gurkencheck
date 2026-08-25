import type {Tag} from '@cucumber/messages';
import {getNodeType} from '../gherkin/keywords.ts';
import type {LintRule, RuleError} from '../types.ts';
import {mergeDefaults} from '../util/collections.ts';

const name = 'no-restricted-tags';

interface RestrictedTagsConfig {
  /** Tag names that are forbidden, written exactly as they appear. */
  tags: string[];
  /** Regular expressions; a tag matching any of them is forbidden. */
  patterns: string[];
}

const availableConfigs: RestrictedTagsConfig = {tags: [], patterns: []};

interface TaggedNode {
  keyword: string;
  tags: readonly Tag[];
}

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

    const check = (node: TaggedNode): void => {
      const nodeType = getNodeType(node, feature.language);
      for (const tag of node.tags) {
        const forbidden =
          forbiddenTags.has(tag.name) || forbiddenPatterns.some((pattern) => pattern.test(tag.name));
        if (forbidden) {
          errors.push({
            message: `Forbidden tag ${tag.name} on ${nodeType}`,
            rule: name,
            line: tag.location.line,
          });
        }
      }
    };

    check(feature);
    for (const child of feature.children) {
      if (child.scenario === undefined) {
        continue;
      }
      check(child.scenario);
      for (const examples of child.scenario.examples) {
        check(examples);
      }
    }
    return errors;
  },
};

export default rule;
