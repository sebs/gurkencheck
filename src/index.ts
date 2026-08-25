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
export {DEFAULT_FORMAT, FORMATTERS, getFormatter, loadFormatter} from './formatters/index.ts';
export type {Formatter} from './formatters/index.ts';
export {toJson} from './formatters/json.ts';
export {toSarif} from './formatters/sarif.ts';
export {version} from './version.ts';
export type {JsonMessage, JsonResult} from './formatters/json.ts';
export {ALWAYS_ON_RULES, PARSER_RULES, parseFeature, readAndParseFile} from './gherkin/parse.ts';
export type {ParseResult} from './gherkin/parse.ts';
export {getNeutralKeyword, getNodeType} from './gherkin/keywords.ts';
export {backgroundsOf, rulesOf, scenariosOf, stepContainersOf} from './gherkin/traverse.ts';
export {countBySeverity, hasErrors, lint} from './linter.ts';
export {readSuppressions} from './suppressions.ts';
export type {Suppressions} from './suppressions.ts';
export {
  getRuleSettings,
  getRuleSeverity,
  isRuleEnabled,
  loadRules,
  resetRules,
  runEnabledRules,
} from './rules.ts';
export {BUILT_IN_RULES} from './rules/index.ts';
export type {
  Configuration,
  FeatureFile,
  FileResult,
  LintRule,
  RuleConfig,
  RuleError,
  RuleRegistry,
  RuleState,
  Severity,
} from './types.ts';
