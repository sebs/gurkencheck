/**
 * Assembling the set of rules available to a run, and running them.
 */
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {BUILT_IN_RULES} from './rules/index.ts';
import type {
  Configuration,
  FeatureFile,
  LintRule,
  RuleConfig,
  RuleError,
  RuleRegistry,
  RunContext,
  RunFinding,
  Severity,
} from './types.ts';
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
    let module: Record<string, unknown>;
    try {
      module = (await import(pathToFileURL(absolute).href)) as Record<string, unknown>;
    } catch (thrown) {
      throw new Error(
        `Could not load the rule "${absolute}": ${thrown instanceof Error ? thrown.message : String(thrown)}`,
      );
    }
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

/** The state a configuration entry asks for. */
function stateOf(config: RuleConfig | undefined): string | undefined {
  return Array.isArray(config) ? config[0] : typeof config === 'string' ? config : undefined;
}

/** True when the configuration switches this rule on, to warn or to fail. */
export function isRuleEnabled(config: RuleConfig | undefined): boolean {
  const state = stateOf(config);
  return state === 'on' || state === 'warn';
}

/** How loudly a rule reports: `warn` only warns, anything else fails the run. */
export function getRuleSeverity(config: RuleConfig | undefined): Severity {
  return stateOf(config) === 'warn' ? 'warning' : 'error';
}

/** The rule's own settings, or `undefined` when only a state was given. */
export function getRuleSettings(config: RuleConfig | undefined): unknown {
  return Array.isArray(config) ? config[1] : undefined;
}

/**
 * Clears the state kept by rules that look for duplicates across files.
 *
 * @deprecated Use `beginRun`, which does this and hands each rule a context
 * of its own besides.
 */
export function resetRules(rules: RuleRegistry): void {
  for (const rule of rules.values()) {
    rule.reset?.();
  }
}

/**
 * One rule's state for one run, made the first time the rule asks for it.
 *
 * Exported because testing a rule on its own means handing it one of these.
 */
export function newRunContext(): RunContext {
  let state: unknown;
  let made = false;
  return {
    state<T>(create: () => T): T {
      if (!made) {
        state = create();
        made = true;
      }
      return state as T;
    },
  };
}

/**
 * What one run of the rules keeps for itself.
 *
 * Two runs in the same process have two of these, so a rule remembering what
 * it has seen cannot see what another run has seen.
 */
export interface Run {
  /** The context for one rule, made the first time it is asked for. */
  contextFor(ruleName: string): RunContext;
}

/** Starts a run, telling every enabled rule that one is beginning. */
export function beginRun(rules: RuleRegistry, configuration: Configuration): Run {
  // Rules written before contexts existed keep their state in the module and
  // clear it here. Deprecated, but still honoured.
  resetRules(rules);

  const contexts = new Map<string, RunContext>();
  const run: Run = {
    contextFor(ruleName: string): RunContext {
      let context = contexts.get(ruleName);
      if (context === undefined) {
        context = newRunContext();
        contexts.set(ruleName, context);
      }
      return context;
    },
  };

  for (const rule of rules.values()) {
    const config = configuration[rule.name];
    if (isRuleEnabled(config)) {
      rule.onRunStart?.(getRuleSettings(config), run.contextFor(rule.name));
    }
  }

  return run;
}

/**
 * Ends a run, collecting what could only be worked out once every file had
 * been seen.
 *
 * As while checking a file, a rule that throws costs you its own findings
 * rather than everyone else's.
 */
export async function finishRun(
  rules: RuleRegistry,
  configuration: Configuration,
  run: Run,
): Promise<RunFinding[]> {
  const findings: RunFinding[] = [];

  for (const rule of rules.values()) {
    const config = configuration[rule.name];
    if (!isRuleEnabled(config) || rule.onRunEnd === undefined) {
      continue;
    }
    const severity = getRuleSeverity(config);

    try {
      const found = await rule.onRunEnd(getRuleSettings(config), run.contextFor(rule.name));
      for (const finding of found) {
        findings.push({severity, ...finding});
      }
    } catch (thrown) {
      // No file to blame: what failed was the look back over all of them.
      findings.push({
        message: `Rule "${rule.name}" failed at the end of the run: ${thrown instanceof Error ? thrown.message : String(thrown)}`,
        rule: 'unexpected-error',
        line: 0,
      });
    }
  }

  return findings;
}

/**
 * Runs every enabled rule against one feature file.
 *
 * Rules are awaited one at a time. Most return an array outright, in which
 * case awaiting costs nothing; a rule that needs to wait for something can
 * return a promise instead.
 *
 * A rule that throws is reported as an `unexpected-error` finding naming it,
 * and the remaining rules still run.
 *
 * `run` carries the state the rules keep between the files of one run. Left
 * out, a run of this one file alone is started, which is what a caller
 * checking a single file wants.
 */
export async function runEnabledRules(
  feature: Feature | undefined,
  file: FeatureFile,
  configuration: Configuration,
  rules: RuleRegistry,
  run: Run = beginRun(rules, configuration),
): Promise<RuleError[]> {
  const errors: RuleError[] = [];

  for (const rule of rules.values()) {
    const config = configuration[rule.name];
    if (!isRuleEnabled(config)) {
      continue;
    }
    const severity = getRuleSeverity(config);

    let found: RuleError[];
    try {
      found = await rule.run(
        feature,
        file,
        getRuleSettings(config),
        run.contextFor(rule.name),
      );
    } catch (thrown) {
      // A rule that throws - one of your own from --rulesdir, or a built-in
      // one meeting a file it did not expect - costs you that rule's findings
      // for this file, not every other rule's. The failure is reported in
      // their place so that it cannot pass unnoticed.
      errors.push({
        message: `Rule "${rule.name}" failed: ${thrown instanceof Error ? thrown.message : String(thrown)}`,
        rule: 'unexpected-error',
        line: 0,
      });
      continue;
    }

    for (const error of found) {
      // The configuration decides how loudly a rule reports, so a custom rule
      // needs no say in it - but one that sets a severity itself is respected.
      errors.push({severity, ...error});
    }
  }

  return errors;
}
