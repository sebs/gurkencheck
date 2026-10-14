/**
 * The `gurkencheck stats` subcommand.
 *
 * Statistics describe a suite rather than judge it, so this always exits 0
 * once it has run: there is no threshold to fail, and nothing here should
 * ever be the reason a build goes red. Only being unable to run at all -
 * an option that makes no sense, a path that names nothing - fails.
 */
import fs from 'node:fs';
import {parseArgs} from 'node:util';
import {describeArgumentError} from '../util/args.ts';
import {DEFAULT_CONFIG_FILE_NAME, readConfiguredLanguage} from '../config-parser.ts';
import {EXIT_OK, EXIT_USAGE} from '../exit-codes.ts';
import {
  DEFAULT_IGNORE_FILE_NAME,
  describeInvalidPattern,
  findFeatureFileStream,
} from '../feature-finder.ts';
import {isKnownLanguage, unknownLanguageMessage} from '../gherkin/dialects.ts';
import {readAndParseFiles} from '../gherkin/parse.ts';
import {SILENT} from '../diagnostics.ts';
import type {Diagnostics} from '../diagnostics.ts';
import {collectStatisticsFrom} from './collect.ts';
import {
  DEFAULT_STATS_FORMAT,
  DEFAULT_TOP,
  STATS_FORMATTERS,
  getStatsFormatter,
} from './format/index.ts';

export function statsUsage(): string {
  return [
    'Usage: gurkencheck stats [options] <feature-files>',
    '',
    'Reports on the shape of your feature files: what is in them, how much of',
    'the step vocabulary is shared, and where it has drifted apart.',
    '',
    'Options:',
    `  -f, --format <format>   output format: ${Object.keys(STATS_FORMATTERS).join(', ')}`,
    `                          (default: ${DEFAULT_STATS_FORMAT})`,
    `  -c, --config <path>     configuration file to take the language from`,
    `                          (default: ${DEFAULT_CONFIG_FILE_NAME})`,
    `  -i, --ignore <globs>    comma separated globs to skip, overriding ${DEFAULT_IGNORE_FILE_NAME};`,
    '                          may be given more than once',
    '  -l, --language <code>   dialect for files with no "# language:" header',
    `      --top <n>           how many entries each list shows (default: ${DEFAULT_TOP})`,
    '  -h, --help              show this message',
    '',
    'With no files given, the working directory is searched recursively.',
    'The report goes to stdout. It exits 0 whatever the numbers say, since it',
    'describes the files rather than judging them - use the linter itself to',
    'fail a build - and 2 only when it could not run, such as for a bad option.',
  ].join('\n');
}

export async function runStats(
  argv: readonly string[],
  diagnostics: Diagnostics = SILENT,
): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      options: {
        format: {type: 'string', short: 'f'},
        config: {type: 'string', short: 'c'},
        ignore: {type: 'string', short: 'i', multiple: true},
        language: {type: 'string', short: 'l'},
        top: {type: 'string'},
        help: {type: 'boolean', short: 'h'},
      },
      allowPositionals: true,
    });
  } catch (thrown) {
    // One line saying what is wrong, rather than the whole help burying it.
    diagnostics.report({level: 'error', message: describeArgumentError(thrown, statsUsage())});
    diagnostics.report({level: 'notice', message: 'Run "gurkencheck stats --help" to see the options.'});
    return EXIT_USAGE;
  }

  const {values, positionals} = parsed;

  if (values.help === true) {
    console.log(statsUsage());
    return EXIT_OK;
  }

  const formatter = getStatsFormatter(values.format);
  if (formatter === undefined) {
    diagnostics.report({
      level: 'error',
      message: `Unsupported format "${values.format}". Use one of ${Object.keys(STATS_FORMATTERS).join(', ')}.`,
    });
    return EXIT_USAGE;
  }

  let top = DEFAULT_TOP;
  if (values.top !== undefined) {
    // Digits only: Number() would also take 0x10, 1e3 and ' 3', none of which
    // anybody means as a count.
    top = /^\d+$/u.test(values.top) ? Number(values.top) : Number.NaN;
    // A count too big to hold exactly is still a whole number, so saying it
    // is not one sends you looking for the wrong mistake.
    if (top > Number.MAX_SAFE_INTEGER) {
      diagnostics.report({
        level: 'error',
        message: `--top can be at most ${Number.MAX_SAFE_INTEGER}, not "${values.top}".`,
      });
      return EXIT_USAGE;
    }
    if (!Number.isSafeInteger(top) || top < 1) {
      diagnostics.report({
        level: 'error',
        message: `--top needs a whole number of at least 1, not "${values.top}".`,
      });
      return EXIT_USAGE;
    }
  }

  if (values.config !== undefined && !fs.existsSync(values.config)) {
    diagnostics.report({
      level: 'error',
      message: `Could not find specified config file "${values.config}"`,
    });
    return EXIT_USAGE;
  }

  // The same dialect the linter would read the files in: --language, or else
  // the configuration's. Nothing else in the configuration matters here.
  let language = values.language;
  if (language === undefined) {
    const configured = await readConfiguredLanguage(values.config);
    if (!configured.ok) {
      diagnostics.report({level: 'error', message: configured.message, details: configured.details});
      return EXIT_USAGE;
    }
    language = configured.language;
  }
  if (language !== undefined && !isKnownLanguage(language)) {
    diagnostics.report({
      level: 'error',
      message: unknownLanguageMessage(language),
    });
    return EXIT_USAGE;
  }

  // Given more than once, the lists add up rather than the last one winning.
  const ignore = values.ignore?.flatMap((list) => list.split(',').map((pattern) => pattern.trim()));
  const {files, invalidPatterns, unreadable} = findFeatureFileStream(positionals, ignore);

  if (invalidPatterns.length > 0) {
    for (const pattern of invalidPatterns) {
      diagnostics.report({
        level: 'error',
        message: describeInvalidPattern(pattern),
      });
    }
    diagnostics.report({
      level: 'detail',
      message: 'Name a feature file, a directory or a glob.',
    });
    return EXIT_USAGE;
  }

  // Counted as they arrive, so a suite of any size costs what the report
  // costs rather than what the suite does.
  const statistics = await collectStatisticsFrom(readAndParseFiles(files, {language}));

  console.log(formatter(statistics, {top}));
  // The numbers leave out whatever was in a directory that could not be
  // read, which the report alone would never show.
  for (const {directory, reason} of unreadable) {
    diagnostics.report({level: 'error', message: `Could not read the directory "${directory}": ${reason}.`});
  }
  return unreadable.length > 0 ? EXIT_USAGE : EXIT_OK;
}
