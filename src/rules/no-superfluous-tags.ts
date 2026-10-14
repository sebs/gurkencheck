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

    const check = (child: TaggableNode, parent: TaggableNode, reported: Set<string>): void => {
      const duplicated = intersectionBy(child.tags, parent.tags, (tag) => tag.name).filter(
        (tag) => !reported.has(tag.name),
      );
      if (duplicated.length === 0) {
        return;
      }
      const childType = getNodeType(child, language);
      const parentType = getNodeType(parent, language);
      for (const tag of duplicated) {
        reported.add(tag.name);
        errors.push({
          message: `Tag duplication between ${childType} and its corresponding ${parentType}: ${tag.name}`,
          rule: name,
          ...at(tag.location),
        });
      }
    };

    // A node inherits the tags of everything it sits inside, so a tag repeated
    // on any ancestor is superfluous - not only one repeated on the nearest.
    // Ancestors come nearest first, and a tag is reported once, against the
    // nearest that has it: one tag to delete is one finding, however many
    // ancestors carry it too.
    for (const {node, ancestors} of taggedNodesOf(feature)) {
      const reported = new Set<string>();
      for (const ancestor of ancestors) {
        check(node, ancestor, reported);
      }
    }

    return errors;
  },
};

export default rule;
