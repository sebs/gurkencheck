/**
 * Reading and validating the configuration file.
 */
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyConfiguration} from './config-verifier.ts';
import {PRESETS, RECOMMENDED} from './presets.ts';
import type {Configuration, RuleRegistry} from './types.ts';
import {stripJsonComments, stripTrailingCommas} from './util/json.ts';
import {resolvePackage} from './util/resolve.ts';

/** The configuration file looked for when none is given on the command line. */
export const DEFAULT_CONFIG_FILE_NAME = '.gurkencheckrc';

/**
 * The configuration file a run with no --config uses: the nearest
 * `.gurkencheckrc` in the working directory or any directory above it, or
 * `undefined` when there is none.
 *
 * Looking only in the working directory meant that running from a
 * subdirectory of a project fell back to the recommended preset without a
 * word, and a run that looks right is checking the wrong thing.
 */
export function findConfigFile(cwd: string = process.cwd()): string | undefined {
  let directory = path.resolve(cwd);
  for (;;) {
    const candidate = path.join(directory, DEFAULT_CONFIG_FILE_NAME);
    if (fs.existsSync(candidate)) {
      return path.relative(cwd, candidate);
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;
  }
}

/** The key naming the configurations to build on top of. */
const EXTENDS = 'extends';

/** The key setting the dialect for files with no `# language:` header. */
const LANGUAGE = 'language';

/** Either a usable configuration, or the reason there isn't one. */
export type ConfigurationResult =
  | {
      ok: true;
      configuration: Configuration;
      source: string;
      language?: string;
      /** The file the language was set in, which may be one extended. */
      languageSource?: string;
      /**
       * Every file the configuration was read from - the file itself and
       * each one it extends, as absolute paths. What a watch has to keep an
       * eye on to know the configuration changed.
       */
      files?: string[];
    }
  | {ok: false; message: string; details: string[]};

class ConfigurationError extends Error {}

function isConfigurationObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Why a file could not be read, in words rather than as an errno. */
function unreadableBecause(thrown: unknown): string {
  const code = (thrown as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'EISDIR') return 'it is a directory, not a file';
  if (code === 'EACCES' || code === 'EPERM') return 'permission was denied';
  if (code === 'ENOENT') return 'it does not exist';
  return thrown instanceof Error ? thrown.message : String(thrown);
}

function parseFile(filePath: string): Record<string, unknown> {
  // Reading and parsing fail for different reasons, and a directory or a
  // file you may not read is not a mistake in its JSON.
  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (thrown) {
    throw new ConfigurationError(`Could not read "${filePath}": ${unreadableBecause(thrown)}.`);
  }
  // JSON.parse refuses a byte order mark, which some editors write.
  const json = stripJsonComments(text.replace(/^\uFEFF/u, ''));
  if (json.trim() === '') {
    throw new ConfigurationError(
      `"${filePath}" is empty. Write {} to switch every rule off, or remove it to use the recommended rules.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripTrailingCommas(json));
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
    resolved = resolvePackage(specifier, from);
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
 *
 * `ancestors` holds the chain of files that led here, not every file seen so
 * far: two files extending the same base is sharing, not a cycle. `files`
 * collects every file read along the way.
 */
async function flatten(
  configuration: Record<string, unknown>,
  source: string,
  ancestors: Set<string>,
  files: Set<string>,
  origins: Map<string, string> = new Map(),
): Promise<Configuration> {
  if (ancestors.has(source)) {
    throw new ConfigurationError(`"${source}" ends up extending itself.`);
  }
  ancestors.add(source);
  if (!Object.hasOwn(PRESETS, source)) {
    files.add(path.resolve(source));
  }

  let merged: Configuration = {};
  try {
    for (const specifier of extendsList(configuration, source)) {
      const extended = await loadExtended(specifier, source);
      merged = {
        ...merged,
        ...(await flatten(extended.configuration, extended.source, ancestors, files, origins)),
      };
    }
  } finally {
    ancestors.delete(source);
  }

  const own = {...configuration};
  delete own[EXTENDS];
  // Set after what this file extends, so the file that wins says where an
  // entry came from.
  for (const key of Object.keys(own)) {
    origins.set(key, source);
  }
  return {...merged, ...(own as Configuration)};
}

/** ` (in "team.json")` for an entry from a file other than the one read. */
function inFile(source: string | undefined, configPath: string): string {
  if (source === undefined || path.resolve(source) === path.resolve(configPath)) {
    return '';
  }
  return ` (in "${Object.hasOwn(PRESETS, source) ? source : path.relative(process.cwd(), source)}")`;
}

/**
 * The `language` a configuration file sets, following what it extends, or
 * `undefined` when there is no file or it sets none.
 *
 * For commands that read feature files without linting them, such as
 * `stats`: they need the dialect, but should not refuse to run over a rule
 * setting they never use. A file that cannot be read at all is still an
 * error - passed over, it would leave the files read in English without a
 * word.
 */
export async function readConfiguredLanguage(
  configPath: string | undefined,
): Promise<{ok: true; language: string | undefined} | {ok: false; message: string; details: string[]}> {
  const file = configPath ?? findConfigFile();
  if (file === undefined) {
    return {ok: true, language: undefined};
  }
  if (!fs.existsSync(file)) {
    return {ok: false, message: `Could not find specified config file "${file}"`, details: []};
  }
  let flattened: {[LANGUAGE]?: unknown};
  try {
    flattened = await flatten(parseFile(file), file, new Set(), new Set());
  } catch (thrown) {
    if (thrown instanceof ConfigurationError) {
      return {ok: false, message: `Could not read config file "${file}"`, details: [thrown.message]};
    }
    throw thrown;
  }
  const language = flattened[LANGUAGE];
  if (language !== undefined && typeof language !== 'string') {
    return {
      ok: false,
      message: `Could not read config file "${file}"`,
      details: [`"${LANGUAGE}" must be a language code, such as "fr".`],
    };
  }
  return {ok: true, language};
}

/**
 * Reads the configuration file at `configPath`, or the nearest
 * `.gurkencheckrc` in the working directory or above it when no path is
 * given. With neither, the recommended rules are used.
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
    const found = findConfigFile();
    if (found === undefined) {
      // Nothing to read, so fall back to the recommended rules rather than
      // refusing to run. Writing a configuration file is then a way to change
      // the defaults, not a hurdle before the first run.
      return {ok: true, configuration: RECOMMENDED, source: 'the recommended preset'};
    }
    configPath = found;
  }

  let flattened: Configuration;
  const files = new Set<string>();
  const origins = new Map<string, string>();
  try {
    flattened = await flatten(parseFile(configPath), configPath, new Set(), files, origins);
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
      details: [`"${LANGUAGE}" must be a language code, such as "fr".${inFile(origins.get(LANGUAGE), configPath)}`],
    };
  }

  // Checked file by file, so a mistake in something extended says where it
  // is rather than leaving you to search the chain for it.
  const bySource = new Map<string, Configuration>();
  for (const [key, value] of Object.entries(configuration)) {
    const source = origins.get(key) ?? configPath;
    bySource.set(source, {...bySource.get(source), [key]: value});
  }
  const errors = [...bySource].flatMap(([source, entries]) =>
    verifyConfiguration(entries, rules).map((error) => `${error}${inFile(source, configPath)}`),
  );
  if (errors.length > 0) {
    return {ok: false, message: `Error(s) in configuration file "${configPath}":`, details: errors};
  }

  return {
    ok: true,
    configuration,
    source: configPath,
    files: [...files],
    ...(language === undefined ? {} : {language, languageSource: origins.get(LANGUAGE) ?? configPath}),
  };
}
