import type {Location} from '@cucumber/messages';
import {getNeutralKeyword, getNodeType} from '../gherkin/keywords.ts';
import {rulesOf, stepContainersOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';
import {mergeDefaults} from '../util/collections.ts';
import {at} from '../util/location.ts';

const name = 'no-restricted-patterns';

/**
 * Patterns are grouped by where they apply. `Global` applies everywhere; the
 * rest apply only inside that kind of block.
 */
const availableConfigs = {
  Global: [] as string[],
  Feature: [] as string[],
  Rule: [] as string[],
  Background: [] as string[],
  Scenario: [] as string[],
  ScenarioOutline: [] as string[],
};

type PatternConfig = typeof availableConfigs;

/**
 * A description written over several lines arrives as one string containing
 * real newlines. A user who literally typed `\n` in a description gets that
 * as two characters, and must not be split on. This sentinel keeps the two
 * apart while splitting.
 */
const ESCAPED_NEWLINE_SENTINEL = '<!gurkencheck new line sentinel!>';

/** Builds the pattern list for each block kind, keyed by neutral keyword. */
function compilePatterns(config: PatternConfig): Map<string, RegExp[]> {
  const global = config.Global.map((pattern) => new RegExp(pattern, 'i'));
  const compiled = new Map<string, RegExp[]>();

  for (const key of Object.keys(availableConfigs) as (keyof PatternConfig)[]) {
    if (key === 'Global') {
      continue;
    }
    const neutralKey = key.toLowerCase().replace(/ /g, '');
    compiled.set(neutralKey, [
      ...config[key].map((pattern) => new RegExp(pattern, 'i')),
      ...global,
    ]);
  }

  return compiled;
}

/** Splits a description into the lines it was written on. */
function toCheckableStrings(property: string, value: string): string[] {
  if (property !== 'description') {
    return [value];
  }
  return value
    .replaceAll('\\n', ESCAPED_NEWLINE_SENTINEL)
    .split('\n')
    .map((line) => line.replaceAll(ESCAPED_NEWLINE_SENTINEL, '\\n'));
}

const rule: LintRule = {
  name,
  availableConfigs,
  run(feature, _file, configuration) {
    if (feature === undefined) {
      return [];
    }

    const patterns = compilePatterns(mergeDefaults(availableConfigs, configuration));
    const language = feature.language;
    const errors: RuleError[] = [];

    const check = (
      node: {keyword: string; location: Location},
      property: 'name' | 'description' | 'text',
      value: string | undefined,
      applicable: readonly RegExp[],
    ): void => {
      if (value === undefined || value === '') {
        return;
      }
      const type = getNodeType(node, language);
      for (const pattern of applicable) {
        for (const candidate of toCheckableStrings(property, value)) {
          // Names and descriptions may be padded with whitespace; steps are not.
          const text = candidate.trim();
          if (pattern.test(text)) {
            errors.push({
              message: `${type} ${property}: "${text}" matches restricted pattern "${pattern}"`,
              rule: name,
              ...at(node.location),
            });
          }
        }
      }
    };

    const patternsFor = (node: {keyword: string}): RegExp[] =>
      patterns.get(getNeutralKeyword(node, language)) ?? [];

    check(feature, 'name', feature.name, patternsFor(feature));
    check(feature, 'description', feature.description, patternsFor(feature));

    for (const featureRule of rulesOf(feature)) {
      const applicable = patternsFor(featureRule);
      check(featureRule, 'name', featureRule.name, applicable);
      check(featureRule, 'description', featureRule.description, applicable);
    }

    for (const {node} of stepContainersOf(feature)) {
      const applicable = patternsFor(node);
      check(node, 'name', node.name, applicable);
      check(node, 'description', node.description, applicable);

      // Steps are checked against the patterns of the block they sit in.
      for (const step of node.steps) {
        check(step, 'text', step.text, applicable);
      }
    }

    return errors;
  },
};

export default rule;
