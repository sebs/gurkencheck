/**
 * The `gurkencheck stats` subcommand.
 *
 * Statistics describe a suite rather than judge it, so this always exits 0
 * once it has run: there is no threshold to fail, and nothing here should
 * ever be the reason a build goes red. Only being unable to run at all -
 * an option that makes no sense, a path that names nothing - fails.
 */
import {parseArgs} from 'node:util';
import {EXIT_OK, EXIT_USAGE} from '../exit-codes.ts';
import {DEFAULT_IGNORE_FILE_NAME, findFeatureFileStream} from '../feature-finder.ts';
import {isKnownLanguage} from '../gherkin/dialects.ts';
import {readAndParseFiles} from '../gherkin/parse.ts';
import * as logger from '../logger.ts';
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
    `  -i, --ignore <globs>    comma separated globs to skip, overriding ${DEFAULT_IGNORE_FILE_NAME}`,
    '  -l, --language <code>   dialect for files with no "# language:" header',
    `      --top <n>           how many entries each list shows (default: ${DEFAULT_TOP})`,
    '  -h, --help              show this message',
    '',
    'With no files given, the working directory is searched recursively.',
    'The report goes to stdout, and always exits 0: it describes the files',
    'rather than judging them. Use the linter itself to fail a build.',
  ].join('\n');
}

export async function runStats(argv: readonly string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      options: {
        format: {type: 'string', short: 'f'},
        ignore: {type: 'string', short: 'i'},
        language: {type: 'string', short: 'l'},
        top: {type: 'string'},
        help: {type: 'boolean', short: 'h'},
      },
      allowPositionals: true,
    });
  } catch (thrown) {
    logger.boldError(thrown instanceof Error ? thrown.message : String(thrown));
    console.error(statsUsage());
    return EXIT_USAGE;
  }

  const {values, positionals} = parsed;

  if (values.help === true) {
    console.log(statsUsage());
    return EXIT_OK;
  }

  const formatter = getStatsFormatter(values.format);
  if (formatter === undefined) {
    logger.boldError(
      `Unsupported format "${values.format}". Use one of ${Object.keys(STATS_FORMATTERS).join(', ')}.`,
    );
    return EXIT_USAGE;
  }

  let top = DEFAULT_TOP;
  if (values.top !== undefined) {
    top = Number(values.top);
    if (!Number.isInteger(top) || top < 1) {
      logger.boldError(`--top needs a whole number of at least 1, not "${values.top}".`);
      return EXIT_USAGE;
    }
  }

  const language = values.language;
  if (language !== undefined && !isKnownLanguage(language)) {
    logger.boldError(`Unknown language "${language}". Use a Gherkin language code, such as "fr".`);
    return EXIT_USAGE;
  }

  const ignore = values.ignore?.split(',').map((pattern) => pattern.trim());
  const {files, invalidPatterns} = findFeatureFileStream(positionals, ignore);

  if (invalidPatterns.length > 0) {
    for (const pattern of invalidPatterns) {
      logger.boldError(`Invalid format of the feature file path/pattern: "${pattern}".`);
    }
    logger.error('To run the linter please specify an existing feature file, directory or glob.');
    return EXIT_USAGE;
  }

  // Counted as they arrive, so a suite of any size costs what the report
  // costs rather than what the suite does.
  const statistics = await collectStatisticsFrom(readAndParseFiles(files, {language}));

  console.log(formatter(statistics, {top}));
  return EXIT_OK;
}
