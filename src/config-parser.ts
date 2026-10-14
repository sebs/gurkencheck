/**
 * Reading and validating the configuration file.
 */
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyConfiguration} from './config-verifier.ts';
import {PRESETS, RECOMMENDED} from './presets.ts';
import type {Configuration, RuleRegistry} from './types.ts';
import {duplicateKeys, stripJsonComments, stripTrailingCommas} from './util/json.ts';
import {installedPackageDirectory, resolvePackage} from './util/resolve.ts';
import {closest} from './util/suggest.ts';
import {asText, reasonOf} from './util/thrown.ts';

/** The configuration file looked for when none is given on the command line. */
export const DEFAULT_CONFIG_FILE_NAME = '.gurkencheckrc';

/**
 * The configuration file a run with no --config uses: the nearest
 * `.gurkencheckrc` in `cwd` (or, for a file, its directory) or any directory
 * above it, as a path from the working directory, or `undefined` when there
 * is none.
 *
 * Looking only in the working directory meant that running from a
 * subdirectory of a project fell back to the recommended preset without a
 * word, and a run that looks right is checking the wrong thing.
 */
export function findConfigFile(cwd: string = process.cwd()): string | undefined {
  // Started from a file - the feature file being edited - its directory.
  let directory = path.resolve(cwd);
  if (lstatOrUndefined(directory)?.isFile() === true) {
    directory = path.dirname(directory);
  }
  for (;;) {
    const candidate = path.join(directory, DEFAULT_CONFIG_FILE_NAME);
    // lstat rather than exists: a symlink to a file that is gone is still a
    // configuration somebody meant to use, and passing over it would lint
    // with the recommended rules as if there were none.
    if (lstatOrUndefined(candidate) !== undefined) {
      // Relative to the working directory, as readConfiguration reads a path,
      // whatever directory the search started from.
      return path.relative(process.cwd(), candidate) || candidate;
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
  | {
      ok: false;
      message: string;
      details: string[];
      /** The files read before the mistake was found, for a watch to keep an eye on. */
      files?: string[];
    };

class ConfigurationError extends Error {}

function isConfigurationObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function lstatOrUndefined(target: string): fs.Stats | undefined {
  try {
    return fs.lstatSync(target);
  } catch {
    return undefined;
  }
}

/**
 * A path as a message shows it: relative to the working directory, as the
 * rest of the messages are, where it is absolute - as a file reached through
 * extends always is - and below the working directory.
 */
function shown(file: string): string {
  if (!path.isAbsolute(file)) {
    return file;
  }
  // Relative only below the working directory: /dev/null shown as
  // ../../../../dev/null reads as a path nobody wrote.
  const relative = path.relative(process.cwd(), file);
  if (relative === '') {
    return '.';
  }
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) ? file : relative;
}

/**
 * Why a configuration named outright cannot be had, or undefined when it is
 * there to read: missing, or out of reach - which, said to be missing, sent
 * you looking for a typo in a path that was right.
 */
function missingConfiguration(file: string): {ok: false; message: string; details: string[]} | undefined {
  try {
    fs.lstatSync(file);
    return undefined;
  } catch (thrown) {
    const code = (thrown as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return {ok: false, message: `Could not find specified config file "${file}"`, details: []};
    }
    return {ok: false, message: `Could not read config file "${file}"`, details: [`Could not reach it: ${unreadableBecause(thrown, file)}.`]};
  }
}

/** Why a file could not be read, in words rather than as an errno. */
function unreadableBecause(thrown: unknown, filePath: string): string {
  const code = (thrown as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'EISDIR') return 'it is a directory, not a file';
  if (code === 'ELOOP') return 'it is a symlink that leads back to itself';
  if (code === 'EACCES' || code === 'EPERM') return 'permission was denied';
  if (code === 'ENOENT') {
    return lstatOrUndefined(filePath)?.isSymbolicLink() === true
      ? `it is a symlink to ${fs.readlinkSync(filePath)}, which does not exist`
      : 'it does not exist';
  }
  return reasonOf(thrown);
}

/**
 * Reads one configuration file. `found` says it is the .gurkencheckrc found
 * without --config, the only one whose removal brings back the recommended
 * rules.
 */
function parseFile(filePath: string, found = false): Record<string, unknown> {
  // Reading and parsing fail for different reasons, and a directory or a
  // file you may not read is not a mistake in its JSON.
  let text: string;
  try {
    // A FIFO, or a device, is waited on for ever by a read: only a regular
    // file is read at all.
    if (!fs.statSync(filePath).isFile() && !fs.statSync(filePath).isDirectory()) {
      throw new ConfigurationError(`Could not read "${shown(filePath)}": it is not a regular file.`);
    }
    text = fs.readFileSync(filePath, 'utf8');
  } catch (thrown) {
    if (thrown instanceof ConfigurationError) {
      throw thrown;
    }
    throw new ConfigurationError(`Could not read "${shown(filePath)}": ${unreadableBecause(thrown, filePath)}.`);
  }
  // JSON.parse refuses a byte order mark, which some editors write.
  const json = stripJsonComments(text.replace(/^\uFEFF/u, ''));
  if (json.trim() === '') {
    throw new ConfigurationError(
      found
        ? `"${shown(filePath)}" is empty. Write {} to switch every rule off, or remove it to use the recommended rules.`
        : `"${shown(filePath)}" is empty. Write {} in it for a configuration with no rules switched on.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripTrailingCommas(json));
  } catch (thrown) {
    throw new ConfigurationError(
      `Could not parse "${shown(filePath)}": ${reasonOf(thrown)}`,
    );
  }
  // JSON.parse keeps the last of a key given twice; a second extends, or a
  // rule listed twice, would drop the first without a word.
  const repeated = duplicateKeys(json);
  if (repeated.length > 0) {
    throw new ConfigurationError(
      `"${shown(filePath)}" gives ${repeated.map((key) => `"${key}"`).join(', ')} more than once; only the last would count.`,
    );
  }
  if (!isConfigurationObject(parsed)) {
    throw new ConfigurationError(
      `"${shown(filePath)}" must hold a JSON object mapping rule names to their settings.`,
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
    `"${EXTENDS}" in "${shown(source)}" must be a name or a list of names.`,
  );
}

/** The built-in preset a name most likely means, prefixed or not. */
function presetMeant(specifier: string): string | undefined {
  // The prefix in any case: GURKENCHECK:RECOMMENDED is one meant too.
  const bare = (name: string): string => name.replace(/^gurkencheck:/iu, '');
  const meant = closest(bare(specifier), Object.keys(PRESETS).map(bare));
  return meant === undefined ? undefined : `gurkencheck:${meant}`;
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
  files: Set<string>,
): Promise<{configuration: Record<string, unknown>; source: string}> {
  // Only the table's own entries: constructor, toString and the like are on
  // every object, and taken for presets they were empty ones - the
  // configuration, or an installed package of that name, silently dropped.
  const preset = Object.hasOwn(PRESETS, specifier) ? PRESETS[specifier] : undefined;
  if (preset !== undefined) {
    return {configuration: preset as Record<string, unknown>, source: specifier};
  }
  // No package name has capitals or a colon, so a prefix in another case
  // is a preset written that way, not a package to look for.
  if (/^gurkencheck:/iu.test(specifier)) {
    const meant = presetMeant(specifier);
    throw new ConfigurationError(
      meant === undefined
        ? `There is no built-in configuration called "${specifier}". Available: ${Object.keys(PRESETS).join(', ')}`
        : `There is no built-in configuration called "${specifier}". Did you mean "${meant}"?`,
    );
  }

  // From where the file really is: a shared configuration symlinked into a
  // project names what it extends relative to itself, not to the link, as
  // node resolves a symlinked module from its target.
  let from = path.resolve(fromFile);
  try {
    from = fs.realpathSync(from);
  } catch {
    // A file that cannot be resolved is reported when it is read.
  }

  if (specifier.startsWith('.') || path.isAbsolute(specifier)) {
    const resolved = path.resolve(path.dirname(from), specifier);
    if (lstatOrUndefined(resolved) === undefined) {
      throw new ConfigurationError(
        `Could not find "${specifier}", extended from "${shown(fromFile)}".`,
      );
    }
    // Noted before it is read, so that a file that cannot be read is among
    // the ones a watch keeps an eye on, and its being fixed is noticed.
    files.add(resolved);
    return {configuration: parseFile(resolved), source: resolved};
  }

  let resolved: string;
  try {
    resolved = resolvePackage(specifier, from);
  } catch (thrown) {
    // Installed, but broken - a manifest that does not parse, no entry point
    // for import - is not a package somebody forgot to install, and asking
    // whether it is sent you to install it again.
    const installed = installedPackageDirectory(specifier, from);
    if (installed !== undefined) {
      throw new ConfigurationError(
        `The package "${specifier}", extended from "${shown(fromFile)}", is installed in "${shown(installed)}" but could not be loaded: ${
          thrown instanceof Error ? thrown.message.split('\n')[0] : asText(thrown)
        }`,
      );
    }
    // A preset named without its prefix - "recommended" - or misspelt is not
    // a package anybody forgot to install.
    const meant = presetMeant(specifier);
    throw new ConfigurationError(
      meant === undefined
        ? `Could not resolve the package "${specifier}", extended from "${shown(fromFile)}". Is it installed?`
        : `Could not resolve the package "${specifier}", extended from "${shown(fromFile)}". Did you mean the built-in "${meant}"?`,
    );
  }

  if (resolved.endsWith('.json')) {
    // Noted before it is read, so that a file that cannot be read is among
    // the ones a watch keeps an eye on, and its being fixed is noticed.
    files.add(resolved);
    return {configuration: parseFile(resolved), source: resolved};
  }

  let module: Record<string, unknown>;
  try {
    module = (await import(pathToFileURL(resolved).href)) as Record<string, unknown>;
  } catch (thrown) {
    throw new ConfigurationError(
      `Could not load "${specifier}", extended from "${shown(fromFile)}": ${reasonOf(thrown)}`,
    );
  }
  // A default export is the configuration, whatever it is: falling back to
  // the module itself when it was null took {default: null} for one, and
  // reported a rule called "default".
  const exported = 'default' in module ? module['default'] : module;
  if (!isConfigurationObject(exported)) {
    throw new ConfigurationError(
      `"${specifier}" does not export a configuration object; its default export is ${
        exported === null ? 'null' : Array.isArray(exported) ? 'an array' : typeof exported
      }.`,
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
    throw new ConfigurationError(`"${shown(source)}" ends up extending itself.`);
  }
  ancestors.add(source);
  if (!Object.hasOwn(PRESETS, source)) {
    files.add(path.resolve(source));
  }

  let merged: Configuration = {};
  try {
    for (const specifier of extendsList(configuration, source)) {
      const extended = await loadExtended(specifier, source, files);
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
): Promise<
  {ok: true; language: string | undefined; languageSource?: string} | {ok: false; message: string; details: string[]}
> {
  const file = configPath ?? findConfigFile();
  if (file === undefined) {
    return {ok: true, language: undefined};
  }
  const missing = missingConfiguration(file);
  if (missing !== undefined) {
    return missing;
  }
  let flattened: {[LANGUAGE]?: unknown};
  const origins = new Map<string, string>();
  try {
    flattened = await flatten(parseFile(file), file, new Set(), new Set(), origins);
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
      details: [`"${LANGUAGE}" must be a language code, such as "fr".${inFile(origins.get(LANGUAGE), file)}`],
    };
  }
  return language === undefined
    ? {ok: true, language}
    : {ok: true, language, languageSource: origins.get(LANGUAGE) ?? file};
}

/** `, set in "ext/team.json"`: where a configured language came from. */
export function setIn(source: string): string {
  return `, set in "${shown(source)}"`;
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
    const missing = missingConfiguration(configPath);
    if (missing !== undefined) {
      return missing;
    }
  }
  const foundByLooking = configPath === undefined;
  if (configPath === undefined) {
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
    flattened = await flatten(parseFile(configPath, foundByLooking), configPath, new Set(), files, origins);
  } catch (thrown) {
    if (thrown instanceof ConfigurationError) {
      return {
        ok: false,
        message: `Could not read config file "${configPath}"`,
        details: [thrown.message],
        files: [path.resolve(configPath), ...files],
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
      files: [...files],
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
    return {ok: false, message: `Error(s) in configuration file "${configPath}":`, details: errors, files: [...files]};
  }

  return {
    ok: true,
    configuration,
    source: configPath,
    files: [...files],
    ...(language === undefined ? {} : {language, languageSource: origins.get(LANGUAGE) ?? configPath}),
  };
}
