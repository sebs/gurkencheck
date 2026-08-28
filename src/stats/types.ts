/**
 * The shape of a statistics run.
 *
 * Everything here is complete: no list is cut short, no number is rounded to
 * fit a screen. Trimming is the formatters' job, so that the JSON output is a
 * full dataset - one a later run can be compared against - while the text
 * report stays short enough to read.
 */

/** A summary of a set of counts, for numbers whose average hides the shape. */
export interface Distribution {
  /** How many values went into the summary. */
  count: number;
  min: number;
  median: number;
  /** The value nine tenths of the set are at or below. */
  p90: number;
  max: number;
  mean: number;
}

/** One scenario, named well enough to go and find it. */
export interface ScenarioRef {
  name: string;
  file: string;
  line: number;
  /** Steps written in the scenario itself, Background steps excluded. */
  steps: number;
}

/** One entry of the step vocabulary: a normalised step and where it is used. */
export interface StepEntry {
  /** The step text after normalisation - what makes two steps "the same". */
  text: string;
  /** How many written steps normalise to this text. */
  count: number;
  /** The step text as somebody actually wrote it, the first time it appears. */
  example: string;
  /** Where that first sighting is. */
  file: string;
  line: number;
}

/** Normalised steps that differ only slightly from each other. */
export interface SimilarGroup {
  /** The steps in the group, most used first. */
  members: StepEntry[];
  /** Written steps covered by the whole group. */
  total: number;
}

/** How often a tag is written. */
export interface TagEntry {
  name: string;
  count: number;
}

/** A file the Gherkin parser refused, and so could not be counted. */
export interface UnreadableFile {
  file: string;
  /** The parser's complaint, or the rule name it maps onto. */
  reason: string;
  line: number;
}

/** How many files were written in each Gherkin dialect. */
export interface LanguageEntry {
  /** The Gherkin language code, such as `en` or `de`. */
  code: string;
  files: number;
}

/** What is in the feature files, counted. */
export interface Inventory {
  features: number;
  rules: number;
  backgrounds: number;
  /** Scenarios that are not Scenario Outlines. */
  scenarios: number;
  scenarioOutlines: number;
  examplesTables: number;
  /** Body rows across every Examples table; header rows are not counted. */
  examplesRows: number;
  /** Steps as written, Background steps included. */
  steps: number;
  dataTables: number;
  docStrings: number;
}

/** How the steps of the suite divide between Given, When and Then. */
export interface KeywordMix {
  given: number;
  when: number;
  then: number;
  /**
   * Steps whose keyword resolves to nothing: an `And` or `But` written before
   * anything for it to carry on from.
   */
  other: number;
}

/** What the steps of the suite look like taken together. */
export interface StepStats {
  /** Steps as written, Background steps included. */
  total: number;
  /** Distinct steps after normalisation. */
  unique: number;
  /**
   * `unique / total`. Low means the team shares a vocabulary; high means
   * everybody invents their own phrasing, and the step definitions rot.
   */
  uniqueRatio: number;
  /** Distinct steps written exactly once - usually accidental one-offs. */
  usedOnce: number;
  /** Every distinct step, most used first. */
  vocabulary: StepEntry[];
  /** Steps that are nearly, but not quite, each other. */
  similar: SimilarGroup[];
  /** Given/When/Then mix, with `And` and `But` resolved to what they follow. */
  keywords: KeywordMix;
  /** Words per step, as a proxy for how detailed the steps have become. */
  wordsPerStep: Distribution;
}

/** What the scenarios of the suite look like taken together. */
export interface ScenarioStats {
  /**
   * The number of test cases: one per Scenario, and one per row of every
   * Examples table. This is the number that predicts how long a suite takes
   * to run, and almost nobody's mental count of it is right.
   */
  effective: number;
  /** Steps per scenario, Background steps excluded. */
  stepsPerScenario: Distribution;
  /** Every scenario, longest first. */
  largest: ScenarioRef[];
}

/** What the tags of the suite look like taken together. */
export interface TagStats {
  /** Tags as written, counting a tag once for every node carrying it. */
  total: number;
  unique: number;
  /** Every distinct tag, most used first. */
  vocabulary: TagEntry[];
  /** Tags written exactly once - very often a typo of one written often. */
  usedOnce: string[];
  /**
   * Scenarios carrying no tag of their own and inheriting none, and so
   * reachable by no tag expression.
   */
  untaggedScenarios: number;
}

/** Everything one statistics run found. */
export interface Statistics {
  files: {
    /** Files the search matched. */
    total: number;
    /** Files the parser accepted, and so the ones every other number is from. */
    parsed: number;
    /** Files the parser refused. Nothing in them is counted. */
    unreadable: UnreadableFile[];
  };
  inventory: Inventory;
  scenarios: ScenarioStats;
  steps: StepStats;
  tags: TagStats;
  /** Dialects in use, most common first. A single stray entry is a bug. */
  languages: LanguageEntry[];
}
