/**
 * gurkencheck as a library.
 *
 * ```ts
 * import {findFeatureFiles, lint, loadRules, readConfiguration} from 'gurkencheck';
 *
 * const rules = await loadRules();
 * const config = readConfiguration('.gurkencheckrc', rules);
 * if (config.ok) {
 *   const {files} = findFeatureFiles(['features']);
 *   const results = await lint(files, config.configuration, rules);
 * }
 * ```
 */
export {DEFAULT_CONFIG_FILE_NAME, readConfiguration} from './config-parser.ts';
export type {ConfigurationResult} from './config-parser.ts';
export {verifyConfiguration} from './config-verifier.ts';
export {PRESETS, RECOMMENDED} from './presets.ts';
export {
  DEFAULT_IGNORE_FILE_NAME,
  DEFAULT_IGNORED_PATTERNS,
  findFeatureFiles,
  readIgnorePatterns,
} from './feature-finder.ts';
export type {FeatureSearch} from './feature-finder.ts';
export {
  DEFAULT_FORMAT,
  FORMATTERS,
  STREAMING_FORMATTERS,
  getFormatter,
  getStreamingFormatter,
  loadFormatter,
  loadStreamingFormatter,
} from './formatters/index.ts';
export type {Formatter, FormatterRun, StreamingFormatter} from './formatters/index.ts';
export {toJson} from './formatters/json.ts';
export {toSarif} from './formatters/sarif.ts';
export {version} from './version.ts';
export type {JsonMessage, JsonResult} from './formatters/json.ts';
export {ALWAYS_ON_RULES, PARSER_RULES, parseFeature, readAndParseFile} from './gherkin/parse.ts';
export type {ParseResult} from './gherkin/parse.ts';
export {getNeutralKeyword, getNodeType} from './gherkin/keywords.ts';
export {DEFAULT_LANGUAGE, detectLanguage, getDialect, isKnownLanguage} from './gherkin/dialects.ts';
export {backgroundsOf, rulesOf, scenariosOf, stepContainersOf} from './gherkin/traverse.ts';
export {EXIT_LINT_ERRORS, EXIT_OK, EXIT_USAGE} from './exit-codes.ts';
export {countBySeverity, hasErrors, lint, lintStream} from './linter.ts';
export type {LintOptions} from './linter.ts';
export {readSuppressions} from './suppressions.ts';
export type {Suppressions} from './suppressions.ts';
export {
  beginRun,
  finishRun,
  getRuleSettings,
  getRuleSeverity,
  isRuleEnabled,
  loadRules,
  newRunContext,
  resetRules,
  runEnabledRules,
} from './rules.ts';
export type {Run} from './rules.ts';
export {BUILT_IN_RULES} from './rules/index.ts';
export {collectStatistics, distribution} from './stats/collect.ts';
export type {CollectOptions} from './stats/collect.ts';
export {DEFAULT_SIMILARITY, boundedEditDistance, groupSimilar} from './stats/similar.ts';
export type {SimilarityOptions} from './stats/similar.ts';
export {
  NUMBER_MARKER,
  PLACEHOLDER_MARKER,
  STRING_MARKER,
  countWords,
  normaliseStepText,
} from './stats/normalise.ts';
export {
  DEFAULT_STATS_FORMAT,
  DEFAULT_TOP,
  STATS_FORMATTERS,
  getStatsFormatter,
  toJson as statisticsToJson,
  toMarkdown,
  toText,
} from './stats/format/index.ts';
export type {StatsFormatOptions, StatsFormatter} from './stats/format/index.ts';
export {runStats, statsUsage} from './stats/command.ts';
export type {
  Distribution,
  Inventory,
  KeywordMix,
  LanguageEntry,
  ScenarioRef,
  ScenarioStats,
  SimilarGroup,
  Statistics,
  StepEntry,
  StepStats,
  TagEntry,
  TagStats,
  UnreadableFile,
} from './stats/types.ts';
export type {
  Configuration,
  FeatureFile,
  FileResult,
  LintRule,
  RuleConfig,
  RuleError,
  RuleRegistry,
  RuleState,
  RunContext,
  RunFinding,
  Severity,
} from './types.ts';
