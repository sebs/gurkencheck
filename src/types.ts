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
  /**
   * How much this finding matters, taken from the rule's state in the
   * configuration. Absent means `error`; a rule need not set it itself.
   */
  severity?: Severity;
}

/** Everything found in one feature file. */
export interface FileResult {
  filePath: string;
  errors: RuleError[];
}

/**
 * Whether a rule is turned on, and how loudly.
 *
 * `warn` reports the same findings as `on` but does not fail the run, for
 * rules a team is working towards rather than enforcing.
 */
export type RuleState = 'on' | 'warn' | 'off';

/** How much a finding matters. */
export type Severity = 'error' | 'warning';

/**
 * A rule's entry in the configuration file: either just a state, or a state
 * plus the rule's own settings.
 */
export type RuleConfig = RuleState | readonly [RuleState, unknown];

/** The parsed contents of a `.gurkencheckrc` file. */
export type Configuration = Record<string, RuleConfig>;

/**
 * Somewhere for a rule to keep what it learns as a run goes on.
 *
 * A rule looking for duplicates has to remember what it has already seen.
 * Keeping that in the module makes it process-global, so two runs at once - a
 * language server checking two folders, a test suite running cases side by
 * side - quietly corrupt each other's state. A context belongs to one rule in
 * one run, so there is nothing shared and nothing to reset.
 */
export interface RunContext {
  /** This rule's state for this run, made the first time it is asked for. */
  state<T>(create: () => T): T;
}

/**
 * A finding that could only be worked out once every file had been seen, so
 * it has to say which file it is about.
 */
export interface RunFinding extends RuleError {
  /**
   * The file this is about, as it was given to the linter. Left out for a
   * finding about the run as a whole rather than about any one file.
   */
  filePath?: string;
}

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
   *
   * `context` is the same object for every file of a run, and a different one
   * for every other run, so it is where anything remembered between files
   * belongs.
   */
  run(
    feature: Feature | undefined,
    file: FeatureFile,
    configuration: unknown,
    context: RunContext,
  ): RuleError[] | Promise<RuleError[]>;
  /**
   * Called once before the first file, for a rule with something to set up.
   * Rules that only accumulate as they go need nothing here: the context
   * makes their state the first time they ask for it.
   */
  onRunStart?(configuration: unknown, context: RunContext): void;
  /**
   * The findings that could only be worked out once every file had been seen,
   * such as two files sharing a name. Called once after the last file, and
   * only for a rule the configuration switched on.
   */
  onRunEnd?(
    configuration: unknown,
    context: RunContext,
  ): RunFinding[] | Promise<RunFinding[]>;
  /**
   * Clears any state kept between files.
   *
   * @deprecated Keep state in the `RunContext` handed to `run` instead. State
   * in the module is shared by every run in the process, so two at once tread
   * on each other. Still called before each run, for rules written before
   * contexts existed.
   */
  reset?(): void;
}

/** All rules available to a run, keyed by name. */
export type RuleRegistry = ReadonlyMap<string, LintRule>;
