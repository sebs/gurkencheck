/**
 * Assembling the set of rules available to a run, and running them.
 */
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {BUILT_IN_RULES} from './rules/index.ts';
import type {Configuration, FeatureFile, LintRule, RuleConfig, RuleError, RuleRegistry} from './types.ts';
import type {Feature} from '@cucumber/messages';
import {globSync} from './util/glob.ts';

/** File extensions a custom rule may be written in. */
const RULE_EXTENSIONS = '{js,mjs,cjs,ts}';

function isRule(candidate: unknown): candidate is LintRule {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof (candidate as LintRule).name === 'string' &&
    typeof (candidate as LintRule).run === 'function'
  );
}

/**
 * Finds the rule in a loaded module. A rule may be the default export, a
 * named `rule` export, or - for CommonJS custom rules - the module itself.
 */
function extractRule(loaded: Record<string, unknown>, source: string): LintRule {
  for (const candidate of [loaded['default'], loaded['rule'], loaded]) {
    if (isRule(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `${source} does not export a rule. A rule module must export an object with a "name" and a "run" function.`,
  );
}

async function loadRulesFrom(directory: string): Promise<LintRule[]> {
  const resolved = path.resolve(directory);
  const files = globSync(`*.${RULE_EXTENSIONS}`, {cwd: resolved});
  const loaded: LintRule[] = [];

  for (const file of files) {
    const absolute = path.join(resolved, file);
    const module = (await import(pathToFileURL(absolute).href)) as Record<string, unknown>;
    loaded.push(extractRule(module, absolute));
  }

  return loaded;
}

/**
 * The built-in rules, plus any found in the given directories. A custom rule
 * with the same name as a built-in one replaces it.
 */
export async function loadRules(
  additionalRulesDirs: readonly string[] = [],
): Promise<RuleRegistry> {
  const registry = new Map<string, LintRule>();

  for (const rule of BUILT_IN_RULES) {
    registry.set(rule.name, rule);
  }
  for (const directory of additionalRulesDirs) {
    for (const rule of await loadRulesFrom(directory)) {
      registry.set(rule.name, rule);
    }
  }

  return registry;
}

/** True when the configuration switches this rule on. */
export function isRuleEnabled(config: RuleConfig | undefined): boolean {
  return Array.isArray(config) ? config[0] === 'on' : config === 'on';
}

/** The rule's own settings, or `undefined` when only a state was given. */
export function getRuleSettings(config: RuleConfig | undefined): unknown {
  return Array.isArray(config) ? config[1] : undefined;
}

/** Clears the state kept by rules that look for duplicates across files. */
export function resetRules(rules: RuleRegistry): void {
  for (const rule of rules.values()) {
    rule.reset?.();
  }
}

/**
 * Runs every enabled rule against one feature file.
 *
 * Rules are awaited one at a time. Most return an array outright, in which
 * case awaiting costs nothing; a rule that needs to wait for something can
 * return a promise instead.
 */
export async function runEnabledRules(
  feature: Feature | undefined,
  file: FeatureFile,
  configuration: Configuration,
  rules: RuleRegistry,
): Promise<RuleError[]> {
  const errors: RuleError[] = [];

  for (const rule of rules.values()) {
    const config = configuration[rule.name];
    if (!isRuleEnabled(config)) {
      continue;
    }
    errors.push(...(await rule.run(feature, file, getRuleSettings(config))));
  }

  return errors;
}
