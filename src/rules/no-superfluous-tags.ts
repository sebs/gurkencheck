import {getNodeType} from '../gherkin/keywords.ts';
import {type TaggableNode, taggedNodesOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';
import {intersectionBy} from '../util/collections.ts';
import {at} from '../util/location.ts';

const name = 'no-superfluous-tags';

const rule: LintRule = {
  name,
  run(feature) {
    if (feature === undefined) {
      return [];
    }

    const errors: RuleError[] = [];
    const language = feature.language;

    const check = (child: TaggableNode, parent: TaggableNode): void => {
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
          ...at(tag.location),
        });
      }
    };

    // A node inherits the tags of everything it sits inside, so a tag repeated
    // on any ancestor is superfluous - not only one repeated on the nearest.
    for (const {node, ancestors} of taggedNodesOf(feature)) {
      for (const ancestor of ancestors) {
        check(node, ancestor);
      }
    }

    return errors;
  },
};

export default rule;
