/**
 * Reading and validating the configuration file.
 */
import fs from 'node:fs';
import type {Configuration, RuleRegistry} from './types.ts';
import {verifyConfiguration} from './config-verifier.ts';
import {stripJsonComments} from './util/json.ts';

/** The configuration file looked for when none is given on the command line. */
export const DEFAULT_CONFIG_FILE_NAME = '.gurkencheckrc';

/** Either a usable configuration, or the reason there isn't one. */
export type ConfigurationResult =
  | {ok: true; configuration: Configuration}
  | {ok: false; message: string; details: string[]};

function isConfigurationObject(value: unknown): value is Configuration {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads the configuration file at `configPath`, or the default file in the
 * working directory when no path is given.
 */
export function readConfiguration(
  configPath: string | undefined,
  rules: RuleRegistry,
): ConfigurationResult {
  if (configPath !== undefined) {
    if (!fs.existsSync(configPath)) {
      return {
        ok: false,
        message: `Could not find specified config file "${configPath}"`,
        details: [],
      };
    }
  } else {
    if (!fs.existsSync(DEFAULT_CONFIG_FILE_NAME)) {
      return {
        ok: false,
        message:
          `Could not find default config file "${DEFAULT_CONFIG_FILE_NAME}" in the working directory.\n` +
          'To use a custom name/path provide the config file using the "-c" arg.',
        details: [],
      };
    }
    configPath = DEFAULT_CONFIG_FILE_NAME;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonComments(fs.readFileSync(configPath, 'utf8')));
  } catch (thrown) {
    return {
      ok: false,
      message: `Could not parse config file "${configPath}"`,
      details: [thrown instanceof Error ? thrown.message : String(thrown)],
    };
  }

  if (!isConfigurationObject(parsed)) {
    return {
      ok: false,
      message: `Could not parse config file "${configPath}"`,
      details: ['The configuration must be a JSON object mapping rule names to their settings.'],
    };
  }

  const errors = verifyConfiguration(parsed, rules);
  if (errors.length > 0) {
    return {ok: false, message: 'Error(s) in configuration file:', details: errors};
  }

  return {ok: true, configuration: parsed};
}
