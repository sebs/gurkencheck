/**
 * Reading and validating the configuration file.
 */
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyConfiguration} from './config-verifier.ts';
import {PRESETS, RECOMMENDED} from './presets.ts';
import type {Configuration, RuleRegistry} from './types.ts';
import {stripJsonComments} from './util/json.ts';

/** The configuration file looked for when none is given on the command line. */
export const DEFAULT_CONFIG_FILE_NAME = '.gurkencheckrc';

/** The key naming the configurations to build on top of. */
const EXTENDS = 'extends';

/** The key setting the dialect for files with no `# language:` header. */
const LANGUAGE = 'language';

/** Either a usable configuration, or the reason there isn't one. */
export type ConfigurationResult =
  | {ok: true; configuration: Configuration; source: string; language?: string}
  | {ok: false; message: string; details: string[]};

class ConfigurationError extends Error {}

function isConfigurationObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseFile(filePath: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonComments(fs.readFileSync(filePath, 'utf8')));
  } catch (thrown) {
    throw new ConfigurationError(
      `Could not parse "${filePath}": ${thrown instanceof Error ? thrown.message : String(thrown)}`,
    );
  }
  if (!isConfigurationObject(parsed)) {
    throw new ConfigurationError(
      `"${filePath}" must hold a JSON object mapping rule names to their settings.`,
    );
  }
  return parsed;
}

/** The `extends` entries of a configuration, as a list. */
function extendsList(configuration: Record<string, unknown>, source: string): string[] {
  const value = configuration[EXTENDS];
  if (value === undefined) {
    return [];
  }
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    return value;
  }
  throw new ConfigurationError(
    `"${EXTENDS}" in "${source}" must be a name or a list of names.`,
  );
}

/**
 * Loads what one `extends` entry refers to: a built-in preset, another
 * configuration file, or a package.
 *
 * Packages and relative paths are resolved from the file doing the extending,
 * so a shared configuration installed in a project is found where you would
 * expect and a relative path means what it looks like.
 */
async function loadExtended(
  specifier: string,
  fromFile: string,
): Promise<{configuration: Record<string, unknown>; source: string}> {
  const preset = PRESETS[specifier];
  if (preset !== undefined) {
    return {configuration: preset as Record<string, unknown>, source: specifier};
  }
  if (specifier.startsWith('gurkencheck:')) {
    throw new ConfigurationError(
      `There is no built-in configuration called "${specifier}". Available: ${Object.keys(PRESETS).join(', ')}`,
    );
  }

  const from = path.resolve(fromFile);

  if (specifier.startsWith('.') || path.isAbsolute(specifier)) {
    const resolved = path.resolve(path.dirname(from), specifier);
    if (!fs.existsSync(resolved)) {
      throw new ConfigurationError(
        `Could not find "${specifier}", extended from "${fromFile}".`,
      );
    }
    return {configuration: parseFile(resolved), source: resolved};
  }

  let resolved: string;
  try {
    resolved = createRequire(pathToFileURL(from)).resolve(specifier);
  } catch {
    throw new ConfigurationError(
      `Could not resolve the package "${specifier}", extended from "${fromFile}". Is it installed?`,
    );
  }

  if (resolved.endsWith('.json')) {
    return {configuration: parseFile(resolved), source: resolved};
  }

  let module: Record<string, unknown>;
  try {
    module = (await import(pathToFileURL(resolved).href)) as Record<string, unknown>;
  } catch (thrown) {
    throw new ConfigurationError(
      `Could not load "${specifier}", extended from "${fromFile}": ${thrown instanceof Error ? thrown.message : String(thrown)}`,
    );
  }
  const exported = module['default'] ?? module;
  if (!isConfigurationObject(exported)) {
    throw new ConfigurationError(
      `"${specifier}" does not export a configuration object.`,
    );
  }
  return {configuration: exported, source: resolved};
}

/**
 * Flattens a configuration and everything it extends into one object. What a
 * file says wins over what it extends, and later entries in an `extends` list
 * win over earlier ones.
 */
async function flatten(
  configuration: Record<string, unknown>,
  source: string,
  seen: Set<string>,
): Promise<Configuration> {
  if (seen.has(source)) {
    throw new ConfigurationError(`"${source}" ends up extending itself.`);
  }
  seen.add(source);

  let merged: Configuration = {};
  for (const specifier of extendsList(configuration, source)) {
    const extended = await loadExtended(specifier, source);
    merged = {...merged, ...(await flatten(extended.configuration, extended.source, seen))};
  }

  const own = {...configuration};
  delete own[EXTENDS];
  return {...merged, ...(own as Configuration)};
}

/**
 * Reads the configuration file at `configPath`, or the default file in the
 * working directory when no path is given. With neither, the recommended
 * rules are used.
 */
export async function readConfiguration(
  configPath: string | undefined,
  rules: RuleRegistry,
): Promise<ConfigurationResult> {
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
      // Nothing to read, so fall back to the recommended rules rather than
      // refusing to run. Writing a configuration file is then a way to change
      // the defaults, not a hurdle before the first run.
      return {ok: true, configuration: RECOMMENDED, source: 'the recommended preset'};
    }
    configPath = DEFAULT_CONFIG_FILE_NAME;
  }

  let flattened: Configuration;
  try {
    flattened = await flatten(parseFile(configPath), configPath, new Set());
  } catch (thrown) {
    if (thrown instanceof ConfigurationError) {
      return {
        ok: false,
        message: `Could not read config file "${configPath}"`,
        details: [thrown.message],
      };
    }
    throw thrown;
  }

  // "language" is a setting rather than a rule, so it is taken out before the
  // rest is checked against the rule list.
  const {[LANGUAGE]: language, ...configuration} = flattened as Configuration & {
    language?: unknown;
  };

  if (language !== undefined && typeof language !== 'string') {
    return {
      ok: false,
      message: `Could not read config file "${configPath}"`,
      details: [`"${LANGUAGE}" must be a language code, such as "fr".`],
    };
  }

  const errors = verifyConfiguration(configuration, rules);
  if (errors.length > 0) {
    return {ok: false, message: 'Error(s) in configuration file:', details: errors};
  }

  return {ok: true, configuration, source: configPath, ...(language === undefined ? {} : {language})};
}
