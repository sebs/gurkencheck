import type {FeatureChild, Location, RuleChild, Tag} from '@cucumber/messages';
import {getNeutralKeyword} from '../gherkin/keywords.ts';
import type {LintRule, RuleError} from '../types.ts';
import {groupBy, mergeDefaults, sortBy} from '../util/collections.ts';
import {at} from '../util/location.ts';

const name = 'indentation';

/** The indentation, in spaces, expected for each kind of line. */
const defaultConfig = {
  Feature: 0,
  Background: 0,
  Rule: 0,
  Scenario: 0,
  Step: 2,
  Examples: 0,
  example: 2,
  given: 2,
  when: 2,
  then: 2,
  and: 2,
  but: 2,
};

type IndentationConfig = typeof defaultConfig & {
  'feature tag': number;
  'rule tag': number;
  'scenario tag': number;
  docstring: number;
  character: IndentationCharacter;
};

/** Which character indentation has to be made of, or `any` to not care. */
type IndentationCharacter = 'any' | 'space' | 'tab';

/** What counts as the wrong character for each setting. */
const WRONG_CHARACTER: Record<Exclude<IndentationCharacter, 'any'>, RegExp> = {
  space: /\t/,
  tab: / /,
};

const availableConfigs = {
  ...defaultConfig,
  // These fall back to the node they belong to rather than to a fixed
  // number, so they have no default of their own.
  'feature tag': -1,
  'rule tag': -1,
  'scenario tag': -1,
  docstring: -1,
  /** One of "any", "space" or "tab". */
  character: 'any',
};

function resolveConfig(configuration: Record<string, unknown>): IndentationConfig {
  const merged = mergeDefaults(defaultConfig, configuration) as IndentationConfig;
  merged['feature tag'] =
    typeof configuration['feature tag'] === 'number' ? configuration['feature tag'] : merged.Feature;
  merged['rule tag'] =
    typeof configuration['rule tag'] === 'number' ? configuration['rule tag'] : merged.Rule;
  merged['scenario tag'] =
    typeof configuration['scenario tag'] === 'number'
      ? configuration['scenario tag']
      : merged.Scenario;
  // A doc string belongs to its step and is conventionally indented one level
  // further in, so it follows the Step setting unless it is set on its own.
  merged.docstring =
    typeof configuration['docstring'] === 'number'
      ? configuration['docstring']
      : merged.Step + 2;
  merged.character =
    configuration['character'] === 'space' || configuration['character'] === 'tab'
      ? configuration['character']
      : 'any';
  return merged;
}

const rule: LintRule = {
  name,
  availableConfigs,
  run(feature, file, configuration) {
    if (feature === undefined) {
      return [];
    }

    const raw = (configuration ?? {}) as Record<string, unknown>;
    const config = resolveConfig(raw);
    const errors: RuleError[] = [];

    // A line can be tested more than once - a tag line groups several tags -
    // so the character check reports each line at most once.
    const characterChecked = new Set<number>();

    const testCharacter = (location: Location, type: keyof IndentationConfig): void => {
      if (config.character === 'any' || characterChecked.has(location.line)) {
        return;
      }
      characterChecked.add(location.line);

      const leading = /^[\t ]*/.exec(file.lines[location.line - 1] ?? '')?.[0] ?? '';
      if (WRONG_CHARACTER[config.character].test(leading)) {
        errors.push({
          message: `Wrong indentation character for "${type}", expected ${config.character}s`,
          rule: name,
          ...at(location),
        });
      }
    };

    const test = (location: Location, type: keyof IndentationConfig): void => {
      testCharacter(location, type);

      // Columns are 1-based, indentation is counted from 0.
      const actual = (location.column ?? 1) - 1;
      const expected = config[type];
      if (actual !== expected) {
        errors.push({
          message: `Wrong indentation for "${type}", expected indentation level of ${expected}, but got ${actual}`,
          rule: name,
          ...at(location),
        });
      }
    };

    const testStep = (step: {
      keyword: string;
      location: Location;
      docString?: {location: Location};
    }): void => {
      const keyword = getNeutralKeyword(step, feature.language);
      // A step only uses its own keyword's setting when the user set one.
      const type = keyword !== '' && keyword in raw ? (keyword as keyof IndentationConfig) : 'Step';
      test(step.location, type);

      if (step.docString !== undefined) {
        test(step.docString.location, 'docstring');
      }
    };

    const testTags = (
      tags: readonly Tag[],
      type: 'feature tag' | 'rule tag' | 'scenario tag',
    ): void => {
      for (const [, tagsOnLine] of groupBy(tags, (tag) => tag.location.line)) {
        const first = sortBy(tagsOnLine, (tag) => tag.location.column ?? 0)[0];
        if (first !== undefined) {
          test(first.location, type);
        }
      }
    };

    // Backgrounds and Scenarios appear both directly under the Feature and
    // inside a Rule, and are indented against the same settings either way.
    const testChild = (child: FeatureChild | RuleChild): void => {
      if (child.background !== undefined) {
        test(child.background.location, 'Background');
        child.background.steps.forEach(testStep);
      } else if (child.scenario !== undefined) {
        test(child.scenario.location, 'Scenario');
        testTags(child.scenario.tags, 'scenario tag');
        child.scenario.steps.forEach(testStep);

        for (const examples of child.scenario.examples) {
          test(examples.location, 'Examples');
          if (examples.tableHeader !== undefined) {
            test(examples.tableHeader.location, 'example');
            for (const row of examples.tableBody) {
              test(row.location, 'example');
            }
          }
        }
      }
    };

    test(feature.location, 'Feature');
    testTags(feature.tags, 'feature tag');

    for (const child of feature.children) {
      if (child.rule !== undefined) {
        test(child.rule.location, 'Rule');
        testTags(child.rule.tags, 'rule tag');
        child.rule.children.forEach(testChild);
      } else {
        testChild(child);
      }
    }

    return errors;
  },
};

export default rule;
