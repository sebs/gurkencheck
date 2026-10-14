import type {Tag} from '@cucumber/messages';
import {taggedNodesOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';
import {groupBy, sortBy} from '../util/collections.ts';
import {at} from '../util/location.ts';

const name = 'one-space-between-tags';

/**
 * The gap as text a reader can see: JSON escapes a tab, but leaves a
 * non-breaking or ideographic space as it is, and the message then read
 * `not " "` - the very character it was about, invisible.
 */
function visible(gap: string): string {
  return JSON.stringify(gap).replace(
    /[^\x21-\x7E]/gu,
    (character) => (character === ' ' ? ' ' : `\\u${character.codePointAt(0)!.toString(16).padStart(4, '0')}`),
  );
}

/** What should be said about the text between two tags, if anything. */
function problemWith(gap: string, current: string, next: string): string | undefined {
  if (gap === ' ') {
    return undefined;
  }
  if (gap === '') {
    return `There is no space between the tags ${current} and ${next}`;
  }
  if (/^ +$/u.test(gap)) {
    return `There is more than one space between the tags ${current} and ${next}`;
  }
  return `The tags ${current} and ${next} should be separated by one space, not ${visible(gap)}`;
}

function checkTags(tags: readonly Tag[], lines: readonly string[], errors: RuleError[]): void {
  for (const [line, tagsOnLine] of groupBy(tags, (tag) => tag.location.line)) {
    const ordered = sortBy(tagsOnLine, (tag) => tag.location.column ?? 0);
    // Gherkin counts columns in characters, not in the UTF-16 units that
    // .length counts, so the line is taken apart the same way.
    const characters = [...(lines[line - 1] ?? '')];
    for (let index = 0; index < ordered.length - 1; index++) {
      const current = ordered[index]!;
      const next = ordered[index + 1]!;
      const endOfCurrent = (current.location.column ?? 0) - 1 + [...current.name].length;
      // What is really between them: a tab, or nothing at all, is as much a
      // break from the convention as two spaces.
      const gap = characters.slice(endOfCurrent, (next.location.column ?? 0) - 1).join('');
      const problem = problemWith(gap, current.name, next.name);
      if (problem !== undefined) {
        errors.push({message: problem, rule: name, ...at(current.location)});
      }
    }
  }
}

const rule: LintRule = {
  name,
  run(feature, file) {
    if (feature === undefined) {
      return [];
    }

    const errors: RuleError[] = [];
    for (const {node} of taggedNodesOf(feature)) {
      checkTags(node.tags, file.lines, errors);
    }
    return errors;
  },
};

export default rule;
