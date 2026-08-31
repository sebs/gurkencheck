#!/usr/bin/env node
/**
 * The gurkencheck command line interface.
 */
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {DEFAULT_CONFIG_FILE_NAME, readConfiguration} from './config-parser.ts';
import {EXIT_LINT_ERRORS, EXIT_OK, EXIT_USAGE} from './exit-codes.ts';
import {
  DEFAULT_IGNORE_FILE_NAME,
  featureRoots,
  findFeatureFileStream,
} from './feature-finder.ts';
import {watch} from './watch.ts';
import {
  DEFAULT_FORMAT,
  FORMATTERS,
  loadFormatter,
  loadStreamingFormatter,
} from './formatters/index.ts';
import {isKnownLanguage} from './gherkin/dialects.ts';
import {hasErrors, lint, lintStream} from './linter.ts';
import {SILENT, TO_STDERR} from './diagnostics.ts';
import type {Diagnostics} from './diagnostics.ts';
import {loadRules} from './rules.ts';
import type {StreamingFormatter} from './formatters/index.ts';
import type {Configuration, RuleRegistry} from './types.ts';
import type {Sequence} from './util/stream.ts';
import {runStats} from './stats/command.ts';
import {version} from './version.ts';

/** Directory names a watch takes no notice of, however deep they turn up. */
const DEFAULT_IGNORED_NAMES = ['node_modules', '.git'];

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
    '  -w, --watch             keep running, checking again whenever a file changes',
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

/**
 * Runs the command line.
 *
 * Anything said about the run goes through `diagnostics`, which says nothing
 * unless it is given somewhere to say it - so calling this from a test or a
 * library leaves the console alone until you ask for it.
 */
export async function run(
  argv: readonly string[],
  diagnostics: Diagnostics = SILENT,
): Promise<number> {
  // Subcommands are matched before the options are read, so that `stats` can
  // accept a --format of its own without the two sets of names colliding.
  // A directory really called `stats` is still lintable, as `./stats`.
  if (argv[0] === 'stats') {
    return runStats(argv.slice(1), diagnostics);
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
        watch: {type: 'boolean', short: 'w'},
        help: {type: 'boolean', short: 'h'},
        version: {type: 'boolean', short: 'v'},
      },
      allowPositionals: true,
    });
  } catch (thrown) {
    diagnostics.report({
      level: 'error',
      message: thrown instanceof Error ? thrown.message : String(thrown),
    });
    diagnostics.report({level: 'notice', message: usage()});
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
    diagnostics.report({
      level: 'error',
      message: thrown instanceof Error ? thrown.message : String(thrown),
    });
    return EXIT_USAGE;
  }

  const configuration = await readConfiguration(values.config, rules);
  if (!configuration.ok) {
    diagnostics.report({
      level: 'error',
      message: configuration.message,
      details: configuration.details,
    });
    return EXIT_USAGE;
  }

  const ignore = values.ignore?.split(',').map((pattern) => pattern.trim());
  // Files are handed over as the walk finds them, so reading and checking
  // start on the first one rather than after the last. Only the patterns are
  // checked here; the walk itself happens once per pass.
  const {invalidPatterns} = findFeatureFileStream(positionals, ignore);

  if (invalidPatterns.length > 0) {
    for (const pattern of invalidPatterns) {
      diagnostics.report({
        level: 'error',
        message: `Invalid format of the feature file path/pattern: "${pattern}".`,
      });
    }
    diagnostics.report({
      level: 'detail',
      message: 'To run the linter please specify an existing feature file, directory or glob.',
    });
    return EXIT_USAGE;
  }

  // A format that can write as the run goes on is driven from the stream, so
  // the first findings appear while the rest of the files are still being
  // checked. The others are handed the whole run at the end, as before.
  let formatter;
  let streaming;
  try {
    streaming = await loadStreamingFormatter(values.format);
    if (streaming === undefined) {
      formatter = await loadFormatter(values.format);
    }
  } catch (thrown) {
    diagnostics.report({
      level: 'error',
      message: thrown instanceof Error ? thrown.message : String(thrown),
    });
    return EXIT_USAGE;
  }

  const language = values.language ?? configuration.language;
  if (language !== undefined && !isKnownLanguage(language)) {
    diagnostics.report({
      level: 'error',
      message: `Unknown language "${language}". Use a Gherkin language code, such as "fr".`,
    });
    return EXIT_USAGE;
  }

  // Discovery is a stream, and a stream can only be read once - so a run that
  // may happen more than once is given a fresh one each time.
  const discover = (): Sequence<string> =>
    findFeatureFileStream(positionals, ignore).files;

  const checkOnce = async (): Promise<number> => {
    if (streaming !== undefined) {
      return await runStreaming(
        streaming,
        discover(),
        configuration.configuration,
        rules,
        language,
        diagnostics,
      );
    }

    const results = await lint(discover(), configuration.configuration, rules, {language});

    // A formatter may print the output itself or hand it back as a string.
    let output;
    try {
      output = await formatter!(results);
    } catch (thrown) {
      diagnostics.report({
        level: 'error',
        message: `The formatter failed: ${thrown instanceof Error ? thrown.message : String(thrown)}`,
      });
      return EXIT_USAGE;
    }
    if (typeof output === 'string' && output !== '') {
      console.log(output);
    }

    return hasErrors(results) ? EXIT_LINT_ERRORS : EXIT_OK;
  };

  if (values.watch === true) {
    // Watching never fails: a run that found something is the normal state of
    // affairs while you are fixing it, and the exit code is only read once,
    // when you stop.
    return await watch(
      featureRoots(positionals),
      values.config ?? DEFAULT_CONFIG_FILE_NAME,
      {diagnostics, ignore: DEFAULT_IGNORED_NAMES},
      checkOnce,
    );
  }

  return await checkOnce();
}

/**
 * Lints while writing, so a long run says something before it is over.
 *
 * Nothing is kept but whether anything has failed: holding every result to
 * count them at the end would give back the memory the stream just saved.
 */
async function runStreaming(
  streaming: StreamingFormatter,
  files: Sequence<string>,
  configuration: Configuration,
  rules: RuleRegistry,
  language: string | undefined,
  diagnostics: Diagnostics,
): Promise<number> {
  const write = (text: string | undefined): void => {
    if (text !== undefined && text !== '') {
      process.stdout.write(text);
    }
  };

  let failed = false;
  try {
    const run = streaming();
    write(run.start?.());
    for await (const result of lintStream(files, configuration, rules, {language})) {
      failed ||= result.errors.some((error) => (error.severity ?? 'error') === 'error');
      write(run.file(result));
    }
    write(run.end?.());
  } catch (thrown) {
    diagnostics.report({
      level: 'error',
      message: `The formatter failed: ${thrown instanceof Error ? thrown.message : String(thrown)}`,
    });
    return EXIT_USAGE;
  }

  return failed ? EXIT_LINT_ERRORS : EXIT_OK;
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

/**
 * Runs the command line, turning anything unexpected into a usage failure.
 *
 * Without this, a crash leaves node to exit 1 - which is the code for "the
 * linter found something" - so a broken run and a dirty feature file would
 * look identical to CI. Anything reaching this handler is a bug rather than a
 * finding, so the whole error is printed and the run fails as unusable.
 */
async function main(argv: readonly string[]): Promise<number> {
  try {
    return await run(argv, TO_STDERR);
  } catch (thrown) {
    TO_STDERR.report({
      level: 'error',
      message: 'gurkencheck stopped unexpectedly. This is a bug, please report it:',
    });
    TO_STDERR.report({
      level: 'detail',
      message: thrown instanceof Error ? (thrown.stack ?? thrown.message) : String(thrown),
    });
    return EXIT_USAGE;
  }
}

// Only take over the process when run as a command, not when imported.
if (isMainModule()) {
  process.exitCode = await main(process.argv.slice(2));
}
