/**
 * Checking a configuration file before anything is linted, so that a typo in
 * a rule name is reported once and clearly rather than silently ignored.
 */
import {ALWAYS_ON_RULES} from './gherkin/parse.ts';
import {BUILT_IN_RULES} from './rules/index.ts';
import type {Configuration, LintRule, RuleRegistry} from './types.ts';

const STATES = ['on', 'warn', 'off'];

function describeAllowed(availableConfigs: unknown): string {
  if (Array.isArray(availableConfigs)) {
    return availableConfigs.map((value) => `"${String(value)}"`).join(', ');
  }
  if (typeof availableConfigs === 'object' && availableConfigs !== null) {
    return Object.keys(availableConfigs)
      .map((key) => `"${key}"`)
      .join(', ');
  }
  return '';
}

/** What a value should be, going by the default it would replace. */
function describeType(fallback: unknown): string {
  if (Array.isArray(fallback)) return 'a list of strings';
  if (typeof fallback === 'number') return 'a number';
  if (typeof fallback === 'boolean') return 'true or false';
  if (typeof fallback === 'string') return 'a string';
  return 'an object';
}

/**
 * Checks each setting against the type of the default it replaces, going
 * into nested settings. A value of the wrong type is not a matter of taste:
 * the rule would crash on it, or quietly do something else - a string where
 * a list belongs is read one character at a time.
 */
function verifyTypes(
  prefix: string,
  defaults: Record<string, unknown>,
  settings: Record<string, unknown>,
  path: string,
  errors: string[],
): void {
  for (const [key, value] of Object.entries(settings)) {
    if (!Object.hasOwn(defaults, key)) {
      continue;
    }
    const fallback = defaults[key];
    const name = `${path}${key}`;
    let fits: boolean;
    if (Array.isArray(fallback)) {
      fits = Array.isArray(value) && value.every((entry) => typeof entry === 'string');
    } else if (typeof fallback === 'number') {
      fits = typeof value === 'number' && Number.isFinite(value);
    } else if (typeof fallback === 'object' && fallback !== null) {
      fits = typeof value === 'object' && value !== null && !Array.isArray(value);
      if (fits) {
        for (const nested of Object.keys(value as object)) {
          if (!Object.hasOwn(fallback, nested)) {
            errors.push(
              `${prefix}"${name}" has no setting called "${nested}". Available settings: ${describeAllowed(fallback)}`,
            );
          }
        }
        verifyTypes(prefix, fallback as Record<string, unknown>, value as Record<string, unknown>, `${name}.`, errors);
        continue;
      }
    } else {
      fits = typeof value === typeof fallback;
    }
    if (!fits) {
      errors.push(`${prefix}"${name}" should be ${describeType(fallback)}, not ${JSON.stringify(value)}`);
    }
  }
}

function verifySettings(
  rule: LintRule,
  settings: unknown,
  errors: string[],
): void {
  const ruleName = rule.name;
  const availableConfigs = rule.availableConfigs;
  const prefix = `Invalid rule configuration for "${ruleName}" - `;

  if (availableConfigs === undefined) {
    // A custom rule may read settings it never declared; a built-in one
    // declares every setting it has, so settings for one with none are a
    // mistake.
    if (BUILT_IN_RULES.includes(rule)) {
      errors.push(`${prefix}the rule has no settings, so the config should be "on", "warn" or "off"`);
    }
    return;
  }

  if (Array.isArray(availableConfigs)) {
    // The rule takes one value out of a fixed list, e.g. "yes" or "no".
    if (!availableConfigs.includes(settings)) {
      errors.push(
        `${prefix}"${String(settings)}" is not one of the allowed values: ${describeAllowed(availableConfigs)}`,
      );
    }
    return;
  }

  if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
    errors.push(`${prefix}the settings should be an object with one or more of: ${describeAllowed(availableConfigs)}`);
    return;
  }

  const allowedKeys = new Set(Object.keys(availableConfigs as Record<string, unknown>));
  for (const key of Object.keys(settings)) {
    if (!allowedKeys.has(key)) {
      errors.push(`${prefix}the rule has no setting called "${key}". Available settings: ${describeAllowed(availableConfigs)}`);
    }
  }

  const before = errors.length;
  verifyTypes(prefix, availableConfigs as Record<string, unknown>, settings as Record<string, unknown>, '', errors);
  // The rule's own checks assume the types are right, so they run only then.
  if (errors.length === before && rule.verifySettings !== undefined) {
    for (const problem of rule.verifySettings(settings as Record<string, unknown>)) {
      errors.push(`${prefix}${problem}`);
    }
  }
}

/** Returns a list of problems; an empty list means the file is usable. */
export function verifyConfiguration(configuration: Configuration, rules: RuleRegistry): string[] {
  const errors: string[] = [];

  for (const [ruleName, ruleConfig] of Object.entries(configuration)) {
    const rule = rules.get(ruleName);
    const prefix = `Invalid rule configuration for "${ruleName}" - `;

    if (rule === undefined) {
      // The rules the parser enforces are documented alongside the rest, so
      // people reasonably list them. Naming one is harmless; asking for it to
      // be off is the only thing worth saying something about.
      if ((ALWAYS_ON_RULES as readonly string[]).includes(ruleName)) {
        const state = Array.isArray(ruleConfig) ? ruleConfig[0] : ruleConfig;
        if (state === 'off') {
          errors.push(
            `${prefix}this rule is always on. A file breaking it cannot be parsed at all, so there is nothing to switch off.`,
          );
        } else if (!STATES.includes(state as string)) {
          errors.push(`${prefix}the config should be "on", "warn" or "off"`);
        }
        continue;
      }
      errors.push(`Rule "${ruleName}" does not exist`);
      continue;
    }

    if (!Array.isArray(ruleConfig)) {
      if (!STATES.includes(ruleConfig as string)) {
        errors.push(`${prefix}the config should be "on", "warn" or "off"`);
      }
      continue;
    }

    if (!STATES.includes(ruleConfig[0] as string)) {
      errors.push(`${prefix}the first part of the config should be "on", "warn" or "off"`);
    }
    if (ruleConfig.length !== 2) {
      errors.push(`${prefix}the config should have exactly 2 parts: a state and the rule's settings`);
      continue;
    }

    verifySettings(rule, ruleConfig[1], errors);
  }

  return errors;
}
