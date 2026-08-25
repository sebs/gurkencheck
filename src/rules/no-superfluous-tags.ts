import type {Tag} from '@cucumber/messages';
import {getNodeType} from '../gherkin/keywords.ts';
import type {LintRule, RuleError} from '../types.ts';
import {intersectionBy} from '../util/collections.ts';

const name = 'no-superfluous-tags';

interface TaggedNode {
  keyword: string;
  tags: readonly Tag[];
}

const rule: LintRule = {
  name,
  run(feature) {
    if (feature === undefined) {
      return [];
    }

    const errors: RuleError[] = [];
    const language = feature.language;

    const check = (child: TaggedNode, parent: TaggedNode): void => {
      const duplicated = intersectionBy(child.tags, parent.tags, (tag) => tag.name);
      if (duplicated.length === 0) {
        return;
      }
      const childType = getNodeType(child, language);
      const parentType = getNodeType(parent, language);
      for (const tag of duplicated) {
        errors.push({
          message: `Tag duplication between ${childType} and its corresponding ${parentType}: ${tag.name}`,
          rule: name,
          line: tag.location.line,
        });
      }
    };

    for (const child of feature.children) {
      const node = child.rule ?? child.background ?? child.scenario;
      if (node === undefined) {
        continue;
      }
      // Backgrounds carry no tags, so this is a no-op for them.
      const tagged: TaggedNode = {keyword: node.keyword, tags: 'tags' in node ? node.tags : []};
      check(tagged, feature);

      if (child.scenario !== undefined) {
        for (const examples of child.scenario.examples) {
          check(examples, feature);
          check(examples, tagged);
        }
      }
    }

    return errors;
  },
};

export default rule;
