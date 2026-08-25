/**
 * The types shared by the linter, the rules and the formatters.
 */
import type {Feature} from '@cucumber/messages';

/** A feature file as handed to the rules. */
export interface FeatureFile {
  /** Path as given on the command line, relative to the working directory. */
  relativePath: string;
  /** The file's content, split into lines. */
  lines: string[];
}

/** A single rule violation. */
export interface RuleError {
  /** Human readable description of what is wrong. */
  message: string;
  /** Name of the rule that produced this error. */
  rule: string;
  /** 1-based line the error points at, or 0 when it concerns the whole file. */
  line: number;
  /**
   * 1-based column the error points at, when the rule knows one. Absent for
   * errors about a whole file or a whole line, such as a missing new line at
   * the end of the file.
   */
  column?: number;
}

/** Everything found in one feature file. */
export interface FileResult {
  filePath: string;
  errors: RuleError[];
}

/** Whether a rule is turned on. */
export type RuleState = 'on' | 'off';

/**
 * A rule's entry in the configuration file: either just a state, or a state
 * plus the rule's own settings.
 */
export type RuleConfig = RuleState | readonly [RuleState, unknown];

/** The parsed contents of a `.gurkencheckrc` file. */
export type Configuration = Record<string, RuleConfig>;

/**
 * A lint rule.
 *
 * `run` is called once per feature file. `feature` is `undefined` when the
 * file could not be parsed into a feature (an empty file, for instance), so
 * every rule has to cope with that.
 */
export interface LintRule {
  /** The name used to switch the rule on in the configuration file. */
  readonly name: string;
  /**
   * The settings this rule accepts, used to validate configuration files.
   * An array lists the allowed values; an object lists the allowed keys.
   */
  readonly availableConfigs?: unknown;
  /**
   * Returns the violations found in this file. A rule that needs to wait for
   * something - reading a file, asking a service - may return a promise.
   */
  run(
    feature: Feature | undefined,
    file: FeatureFile,
    configuration: unknown,
  ): RuleError[] | Promise<RuleError[]>;
  /**
   * Clears any state kept between files. Implemented by the rules that look
   * for duplicates across a whole run; called once before each lint run.
   */
  reset?(): void;
}

/** All rules available to a run, keyed by name. */
export type RuleRegistry = ReadonlyMap<string, LintRule>;
