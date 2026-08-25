/**
 * Checking a configuration file before anything is linted, so that a typo in
 * a rule name is reported once and clearly rather than silently ignored.
 */
import {ALWAYS_ON_RULES} from './gherkin/parse.ts';
import type {Configuration, RuleRegistry} from './types.ts';

const STATES = ['on', 'off'];

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

function verifySettings(
  ruleName: string,
  availableConfigs: unknown,
  settings: unknown,
  errors: string[],
): void {
  const prefix = `Invalid rule configuration for "${ruleName}" - `;

  if (availableConfigs === undefined) {
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
          errors.push(`${prefix}the config should be "on" or "off"`);
        }
        continue;
      }
      errors.push(`Rule "${ruleName}" does not exist`);
      continue;
    }

    if (!Array.isArray(ruleConfig)) {
      if (!STATES.includes(ruleConfig as string)) {
        errors.push(`${prefix}the config should be "on" or "off"`);
      }
      continue;
    }

    if (!STATES.includes(ruleConfig[0] as string)) {
      errors.push(`${prefix}the first part of the config should be "on" or "off"`);
    }
    if (ruleConfig.length !== 2) {
      errors.push(`${prefix}the config should have exactly 2 parts: a state and the rule's settings`);
      continue;
    }

    verifySettings(ruleName, rule.availableConfigs, ruleConfig[1], errors);
  }

  return errors;
}
