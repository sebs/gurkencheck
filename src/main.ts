#!/usr/bin/env node
/**
 * The gurkencheck command line interface.
 */
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {DEFAULT_CONFIG_FILE_NAME, readConfiguration} from './config-parser.ts';
import {EXIT_LINT_ERRORS, EXIT_OK, EXIT_USAGE} from './exit-codes.ts';
import {DEFAULT_IGNORE_FILE_NAME, findFeatureFiles} from './feature-finder.ts';
import {DEFAULT_FORMAT, FORMATTERS, loadFormatter} from './formatters/index.ts';
import {isKnownLanguage} from './gherkin/dialects.ts';
import {hasErrors, lint} from './linter.ts';
import * as logger from './logger.ts';
import {loadRules} from './rules.ts';
import {runStats} from './stats/command.ts';
import {version} from './version.ts';

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
    '  -l, --language <code>   dialect for files with no "# language:" header',
    '  -h, --help              show this message',
    '  -v, --version           show the version number',
    '',
    'Commands:',
    '  stats [paths]           report on the shape of your feature files,',
    '                          rather than on what is wrong with them',
    '',
    'With no files given, the working directory is searched recursively.',
    'Documentation: https://sebs.github.io/gurkencheck/',
  ].join('\n');
}

export async function run(argv: readonly string[]): Promise<number> {
  // Subcommands are matched before the options are read, so that `stats` can
  // accept a --format of its own without the two sets of names colliding.
  // A directory really called `stats` is still lintable, as `./stats`.
  if (argv[0] === 'stats') {
    return runStats(argv.slice(1));
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      options: {
        format: {type: 'string', short: 'f'},
        config: {type: 'string', short: 'c'},
        ignore: {type: 'string', short: 'i'},
        rulesdir: {type: 'string', short: 'r', multiple: true},
        language: {type: 'string', short: 'l'},
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

  const language = values.language ?? configuration.language;
  if (language !== undefined && !isKnownLanguage(language)) {
    logger.boldError(`Unknown language "${language}". Use a Gherkin language code, such as "fr".`);
    return EXIT_USAGE;
  }

  const results = await lint(files, configuration.configuration, rules, {language});

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
