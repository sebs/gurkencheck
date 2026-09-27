import type {Location} from '@cucumber/messages';
import {getNeutralKeyword, getNodeType} from '../gherkin/keywords.ts';
import {rulesOf, stepContainersOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';
import {mergeDefaults} from '../util/collections.ts';
import {at} from '../util/location.ts';
import {invalidPatterns} from '../util/patterns.ts';

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
  verifySettings: (settings) =>
    Object.entries(settings).flatMap(([key, patterns]) => invalidPatterns(key, patterns, 'i')),
  run(feature, file, configuration) {
    if (feature === undefined) {
      return [];
    }

    const patterns = compilePatterns(mergeDefaults(availableConfigs, configuration));
    const language = feature.language;
    const errors: RuleError[] = [];

    /** Reports every pattern the text matches, at the given position. */
    const report = (
      type: string,
      property: string,
      text: string,
      applicable: readonly RegExp[],
      position: {line: number; column?: number},
    ): void => {
      for (const pattern of applicable) {
        if (pattern.test(text)) {
          errors.push({
            message: `${type} ${property}: "${text}" matches restricted pattern "${pattern}"`,
            rule: name,
            ...position,
          });
        }
      }
    };

    const check = (
      node: {keyword: string; location: Location},
      property: 'name' | 'text',
      value: string | undefined,
      applicable: readonly RegExp[],
      location: Location = node.location,
    ): void => {
      if (value === undefined || value === '') {
        return;
      }
      // Names may be padded with whitespace; steps are not.
      report(getNodeType(node, language), property, value.trim(), applicable, at(location));
    };

    /**
     * A description, line by line, each reported on the line it is written
     * on. The description starts below the keyword line, and a comment
     * between its lines is left out of it, so each line is looked for in the
     * file rather than counted.
     */
    const checkDescription = (
      node: {keyword: string; location: Location; description?: string},
      applicable: readonly RegExp[],
    ): void => {
      if (node.description === undefined || node.description === '') {
        return;
      }
      const type = getNodeType(node, language);
      let searchFrom = node.location.line;
      for (const candidate of toCheckableStrings('description', node.description)) {
        const text = candidate.trim();
        if (text === '') continue;
        const index = file.lines.findIndex(
          (line, lineIndex) => lineIndex >= searchFrom && line.trim() === text,
        );
        const line = index === -1 ? node.location.line : index + 1;
        if (index !== -1) searchFrom = index + 1;
        report(type, 'description', text, applicable, {line});
      }
    };

    const patternsFor = (node: {keyword: string}): RegExp[] =>
      patterns.get(getNeutralKeyword(node, language)) ?? [];

    check(feature, 'name', feature.name, patternsFor(feature));
    checkDescription(feature, patternsFor(feature));

    for (const featureRule of rulesOf(feature)) {
      const applicable = patternsFor(featureRule);
      check(featureRule, 'name', featureRule.name, applicable);
      checkDescription(featureRule, applicable);
    }

    for (const {node} of stepContainersOf(feature)) {
      const applicable = patternsFor(node);
      check(node, 'name', node.name, applicable);
      checkDescription(node, applicable);

      // Steps, and what they carry, are checked against the patterns of the
      // block they sit in.
      for (const step of node.steps) {
        check(step, 'text', step.text, applicable);
        for (const row of step.dataTable?.rows ?? []) {
          for (const cell of row.cells) {
            if (cell.value.trim() !== '') {
              report('Step', 'data table', cell.value.trim(), applicable, at(cell.location));
            }
          }
        }
        if (step.docString !== undefined) {
          const {content, location} = step.docString;
          content.split('\n').forEach((line, index) => {
            if (line.trim() !== '') {
              report('Step', 'doc string', line.trim(), applicable, {line: location.line + 1 + index});
            }
          });
        }
      }

      // An outline's Examples belong to it, and take its patterns.
      for (const examples of 'examples' in node ? node.examples : []) {
        check(examples, 'name', examples.name, applicable);
        checkDescription(examples, applicable);
      }
    }

    return errors;
  },
};

export default rule;
