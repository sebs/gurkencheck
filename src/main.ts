#!/usr/bin/env node
/**
 * The gurkencheck command line interface.
 */
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {DEFAULT_CONFIG_FILE_NAME, readConfiguration} from './config-parser.ts';
import {DEFAULT_IGNORE_FILE_NAME, findFeatureFiles} from './feature-finder.ts';
import {DEFAULT_FORMAT, FORMATTERS, loadFormatter} from './formatters/index.ts';
import {hasErrors, lint} from './linter.ts';
import * as logger from './logger.ts';
import {loadRules} from './rules.ts';
import {version} from './version.ts';

/** Nothing to report. */
const EXIT_OK = 0;
/** At least one finding serious enough to fail the run. Warnings alone do not. */
const EXIT_LINT_ERRORS = 1;
/** The linter could not run: bad arguments, missing or invalid config. */
const EXIT_USAGE = 2;

function usage(): string {
  return [
    'Usage: gurkencheck [options] <feature-files>',
    '',
    'Lints Gherkin feature files against the rules in your configuration file.',
    '',
    'Options:',
    `  -f, --format <format>   output format: ${Object.keys(FORMATTERS).join(', ')},`,
    '                          or the path to a formatter of your own',
    `                          (default: ${DEFAULT_FORMAT})`,
    `  -c, --config <path>     configuration file (default: ${DEFAULT_CONFIG_FILE_NAME})`,
    `  -i, --ignore <globs>    comma separated globs to skip, overriding ${DEFAULT_IGNORE_FILE_NAME}`,
    '  -r, --rulesdir <dir>    directory of custom rules; may be given more than once',
    '  -h, --help              show this message',
    '  -v, --version           show the version number',
    '',
    'With no files given, the working directory is searched recursively.',
    'Documentation: https://gurkencheck.github.io/gurkencheck/',
  ].join('\n');
}

export async function run(argv: readonly string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      options: {
        format: {type: 'string', short: 'f'},
        config: {type: 'string', short: 'c'},
        ignore: {type: 'string', short: 'i'},
        rulesdir: {type: 'string', short: 'r', multiple: true},
        help: {type: 'boolean', short: 'h'},
        version: {type: 'boolean', short: 'v'},
      },
      allowPositionals: true,
    });
  } catch (thrown) {
    logger.boldError(thrown instanceof Error ? thrown.message : String(thrown));
    console.error(usage());
    return EXIT_USAGE;
  }

  const {values, positionals} = parsed;

  if (values.help === true) {
    console.log(usage());
    return EXIT_OK;
  }
  if (values.version === true) {
    console.log(version());
    return EXIT_OK;
  }

  const additionalRulesDirs = values.rulesdir ?? [];
  let rules;
  try {
    rules = await loadRules(additionalRulesDirs);
  } catch (thrown) {
    logger.boldError(thrown instanceof Error ? thrown.message : String(thrown));
    return EXIT_USAGE;
  }

  const configuration = await readConfiguration(values.config, rules);
  if (!configuration.ok) {
    logger.boldError(configuration.message);
    for (const detail of configuration.details) {
      logger.error(`- ${detail}`);
    }
    return EXIT_USAGE;
  }

  const ignore = values.ignore?.split(',').map((pattern) => pattern.trim());
  const {files, invalidPatterns} = findFeatureFiles(positionals, ignore);

  if (invalidPatterns.length > 0) {
    for (const pattern of invalidPatterns) {
      logger.boldError(`Invalid format of the feature file path/pattern: "${pattern}".`);
    }
    logger.error('To run the linter please specify an existing feature file, directory or glob.');
    return EXIT_USAGE;
  }

  let formatter;
  try {
    formatter = await loadFormatter(values.format);
  } catch (thrown) {
    logger.boldError(thrown instanceof Error ? thrown.message : String(thrown));
    return EXIT_USAGE;
  }

  const results = await lint(files, configuration.configuration, rules);

  // A formatter may print the output itself or hand it back as a string.
  const output = await formatter(results);
  if (typeof output === 'string' && output !== '') {
    console.log(output);
  }

  return hasErrors(results) ? EXIT_LINT_ERRORS : EXIT_OK;
}

/**
 * True when this file is the script node was asked to run.
 *
 * npm installs the command as a symlink in `node_modules/.bin`, and on some
 * systems the temporary and home directories are symlinked too, so both sides
 * have to be resolved before they can be compared.
 */
function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  if (entryPoint === undefined) {
    return false;
  }
  try {
    return import.meta.url === pathToFileURL(fs.realpathSync(entryPoint)).href;
  } catch {
    return false;
  }
}

// Only take over the process when run as a command, not when imported.
if (isMainModule()) {
  process.exitCode = await run(process.argv.slice(2));
}
