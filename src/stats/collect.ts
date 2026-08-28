/**
 * Counting what is in a set of feature files.
 *
 * This walks the same parsed documents the rules see, so a suite written in
 * German or French is counted like any other: the keywords come back through
 * `getNeutralKeyword`, and `And` and `But` are resolved to the keyword they
 * carry on from before the Given/When/Then mix is worked out.
 *
 * Nothing here decides whether a number is good or bad. A statistics run
 * always succeeds; it is the rules that have opinions.
 */
import type {Feature, Scenario} from '@cucumber/messages';
import type {ParseResult} from '../gherkin/parse.ts';
import {getNeutralKeyword, resolvedStepKeywords} from '../gherkin/keywords.ts';
import {
  backgroundsOf,
  rulesOf,
  scenariosOf,
  stepContainersOf,
  taggedNodesOf,
} from '../gherkin/traverse.ts';
import {countWords, normaliseStepText} from './normalise.ts';
import {DEFAULT_SIMILARITY, groupSimilar} from './similar.ts';
import type {SimilarityOptions} from './similar.ts';
import type {
  Distribution,
  Inventory,
  KeywordMix,
  ScenarioRef,
  SimilarGroup,
  StepEntry,
  Statistics,
  TagEntry,
  UnreadableFile,
} from './types.ts';

export interface CollectOptions {
  /** How alike two steps have to be to be reported as nearly the same. */
  similarity?: SimilarityOptions;
}

/**
 * A summary of a set of counts.
 *
 * The quantiles are nearest-rank: the median of an even set is the lower of
 * the two middle values rather than the average of them, so every number in
 * the summary is a number some scenario actually has.
 */
export function distribution(values: readonly number[]): Distribution {
  if (values.length === 0) {
    return {count: 0, min: 0, median: 0, p90: 0, max: 0, mean: 0};
  }

  const sorted = [...values].sort((a, b) => a - b);
  const rank = (quantile: number): number =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1))] ?? 0;
  const sum = sorted.reduce((total, value) => total + value, 0);

  return {
    count: sorted.length,
    min: sorted[0] ?? 0,
    median: rank(0.5),
    p90: rank(0.9),
    max: sorted[sorted.length - 1] ?? 0,
    mean: sum / sorted.length,
  };
}

/** A step as written, remembered against the normalised form it belongs to. */
interface Sighting {
  count: number;
  example: string;
  file: string;
  line: number;
}

/** True when the node is a Scenario Outline rather than a plain Scenario. */
function isOutline(scenario: Scenario, language: string): boolean {
  return getNeutralKeyword(scenario, language) === 'scenariooutline';
}

/**
 * How many test cases a scenario stands for: one, or one per row of its
 * Examples tables. This is how `max-scenarios-per-file` counts too, so the
 * two never disagree about the size of a suite.
 */
function testCases(scenario: Scenario): number {
  if (scenario.examples.length === 0) {
    return 1;
  }
  return scenario.examples.reduce((total, examples) => total + examples.tableBody.length, 0);
}

function tally<T>(counts: Map<T, number>, key: T): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/** Most used first, and alphabetically within an equal count. */
function byCountThenName<T extends {count: number}>(name: (entry: T) => string) {
  return (a: T, b: T): number => {
    if (a.count !== b.count) {
      return b.count - a.count;
    }
    const left = name(a);
    const right = name(b);
    return left < right ? -1 : left > right ? 1 : 0;
  };
}

/** Counts everything in one already parsed feature file. */
function collectFile(
  feature: Feature,
  file: string,
  into: {
    inventory: Inventory;
    steps: Map<string, Sighting>;
    keywords: KeywordMix;
    stepWords: number[];
    stepsPerScenario: number[];
    scenarios: ScenarioRef[];
    tags: Map<string, number>;
    effective: number;
    untagged: number;
  },
): void {
  const language = feature.language;
  const {inventory} = into;

  inventory.features += 1;
  inventory.rules += [...rulesOf(feature)].length;
  inventory.backgrounds += [...backgroundsOf(feature)].length;

  for (const {scenario, rule} of scenariosOf(feature)) {
    if (isOutline(scenario, language)) {
      inventory.scenarioOutlines += 1;
    } else {
      inventory.scenarios += 1;
    }

    for (const examples of scenario.examples) {
      inventory.examplesTables += 1;
      inventory.examplesRows += examples.tableBody.length;
    }

    into.effective += testCases(scenario);
    into.stepsPerScenario.push(scenario.steps.length);
    into.scenarios.push({
      name: scenario.name,
      file,
      line: scenario.location.line,
      steps: scenario.steps.length,
    });

    // A scenario with no tag of its own and none to inherit cannot be picked
    // out by any tag expression, however carefully the run is filtered.
    if (scenario.tags.length === 0 && feature.tags.length === 0 && (rule?.tags.length ?? 0) === 0) {
      into.untagged += 1;
    }
  }

  for (const {node} of stepContainersOf(feature)) {
    const keywords = resolvedStepKeywords(node.steps, language);

    node.steps.forEach((step, index) => {
      inventory.steps += 1;
      if (step.dataTable !== undefined) {
        inventory.dataTables += 1;
      }
      if (step.docString !== undefined) {
        inventory.docStrings += 1;
      }

      into.stepWords.push(countWords(step.text));

      const keyword = keywords[index];
      if (keyword === 'given' || keyword === 'when' || keyword === 'then') {
        into.keywords[keyword] += 1;
      } else {
        into.keywords.other += 1;
      }

      const text = normaliseStepText(step.text);
      const seen = into.steps.get(text);
      if (seen === undefined) {
        into.steps.set(text, {count: 1, example: step.text.trim(), file, line: step.location.line});
      } else {
        seen.count += 1;
      }
    });
  }

  for (const {node} of taggedNodesOf(feature)) {
    for (const tag of node.tags) {
      tally(into.tags, tag.name);
    }
  }
}

/**
 * Counts a set of parsed feature files.
 *
 * Files the parser refused are listed rather than counted: half a broken file
 * is worse than none of it, because the numbers would quietly be wrong.
 */
export function collectStatistics(
  parsed: readonly ParseResult[],
  options: CollectOptions = {},
): Statistics {
  const inventory: Inventory = {
    features: 0,
    rules: 0,
    backgrounds: 0,
    scenarios: 0,
    scenarioOutlines: 0,
    examplesTables: 0,
    examplesRows: 0,
    steps: 0,
    dataTables: 0,
    docStrings: 0,
  };
  const into = {
    inventory,
    steps: new Map<string, Sighting>(),
    keywords: {given: 0, when: 0, then: 0, other: 0},
    stepWords: [] as number[],
    stepsPerScenario: [] as number[],
    scenarios: [] as ScenarioRef[],
    tags: new Map<string, number>(),
    effective: 0,
    untagged: 0,
  };

  const unreadable: UnreadableFile[] = [];
  const languages = new Map<string, number>();
  let readable = 0;

  for (const result of parsed) {
    const file = result.file.relativePath;
    const failure = result.errors[0];
    if (failure !== undefined) {
      unreadable.push({file, reason: failure.message, line: failure.line});
      continue;
    }

    readable += 1;
    // An empty file parses without complaint and holds nothing to count.
    if (result.feature === undefined) {
      continue;
    }

    tally(languages, result.feature.language);
    collectFile(result.feature, file, into);
  }

  const vocabulary: StepEntry[] = [...into.steps]
    .map(([text, sighting]) => ({text, ...sighting}))
    .sort(byCountThenName<StepEntry>((entry) => entry.text));

  const similar: SimilarGroup[] = groupSimilar(
    vocabulary,
    options.similarity ?? DEFAULT_SIMILARITY,
  )
    .map((members) => ({
      members,
      total: members.reduce((sum, member) => sum + member.count, 0),
    }))
    .sort((a, b) => b.total - a.total || b.members.length - a.members.length);

  const tagVocabulary: TagEntry[] = [...into.tags]
    .map(([name, count]) => ({name, count}))
    .sort(byCountThenName<TagEntry>((entry) => entry.name));

  return {
    files: {total: parsed.length, parsed: readable, unreadable},
    inventory,
    scenarios: {
      effective: into.effective,
      stepsPerScenario: distribution(into.stepsPerScenario),
      largest: [...into.scenarios].sort((a, b) => b.steps - a.steps),
    },
    steps: {
      total: inventory.steps,
      unique: vocabulary.length,
      uniqueRatio: inventory.steps === 0 ? 0 : vocabulary.length / inventory.steps,
      usedOnce: vocabulary.filter((entry) => entry.count === 1).length,
      vocabulary,
      similar,
      keywords: into.keywords,
      wordsPerStep: distribution(into.stepWords),
    },
    tags: {
      total: tagVocabulary.reduce((sum, entry) => sum + entry.count, 0),
      unique: tagVocabulary.length,
      vocabulary: tagVocabulary,
      usedOnce: tagVocabulary.filter((entry) => entry.count === 1).map((entry) => entry.name),
      untaggedScenarios: into.untagged,
    },
    languages: [...languages]
      .map(([code, files]) => ({code, files}))
      .sort((a, b) => b.files - a.files || (a.code < b.code ? -1 : 1)),
  };
}
