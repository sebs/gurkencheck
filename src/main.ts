#!/usr/bin/env node
/**
 * The gurkencheck command line interface.
 */
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {describeArgumentError} from './util/args.ts';
import {DEFAULT_CONFIG_FILE_NAME, findConfigFile, readConfiguration} from './config-parser.ts';
import {EXIT_LINT_ERRORS, EXIT_OK, EXIT_USAGE} from './exit-codes.ts';
import {
  DEFAULT_IGNORE_FILE_NAME,
  featureRoots,
  describeInvalidPattern,
  findFeatureFileStream,
} from './feature-finder.ts';
import {watch} from './watch.ts';
import {
  DEFAULT_FORMAT,
  FORMATTERS,
  loadFormatter,
  loadStreamingFormatter,
} from './formatters/index.ts';
import {isKnownLanguage, unknownLanguageMessage} from './gherkin/dialects.ts';
import {hasErrors, lint, lintStream} from './linter.ts';
import {SILENT, TO_STDERR} from './diagnostics.ts';
import type {Diagnostics} from './diagnostics.ts';
import {isRuleEnabled, loadRules} from './rules.ts';
import {BUILT_IN_RULES} from './rules/index.ts';
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
    `  -i, --ignore <globs>    comma separated globs to skip, overriding ${DEFAULT_IGNORE_FILE_NAME};`,
    '                          may be given more than once',
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
        ignore: {type: 'string', short: 'i', multiple: true},
        rulesdir: {type: 'string', short: 'r', multiple: true},
        language: {type: 'string', short: 'l'},
        watch: {type: 'boolean', short: 'w'},
        help: {type: 'boolean', short: 'h'},
        version: {type: 'boolean', short: 'v'},
      },
      allowPositionals: true,
    });
  } catch (thrown) {
    // One line saying what is wrong, rather than the whole help burying it.
    diagnostics.report({level: 'error', message: describeArgumentError(thrown, usage())});
    diagnostics.report({level: 'notice', message: 'Run "gurkencheck --help" to see the options.'});
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

  /**
   * The configuration and the dialect it asks for, or `undefined` once what
   * is wrong with them has been reported. Read again on every pass of a
   * watch, since a change to the configuration is one of the things it
   * checks again for.
   */
  const readSettings = async (): Promise<
    {configuration: Configuration; language: string | undefined; files?: string[]} | undefined
  > => {
    const read = await readConfiguration(values.config, rules);
    if (!read.ok) {
      diagnostics.report({level: 'error', message: read.message, details: read.details});
      return undefined;
    }
    const language = values.language ?? read.language;
    if (language !== undefined && !isKnownLanguage(language)) {
      // Said where it came from: a flag is fixed differently from a file.
      const from =
        values.language === undefined && read.languageSource !== undefined
          ? `, set in "${path.relative(process.cwd(), read.languageSource) || read.languageSource}"`
          : ' given to --language';
      diagnostics.report({
        level: 'error',
        message: unknownLanguageMessage(language, from),
      });
      return undefined;
    }
    return {configuration: read.configuration, language, files: read.files};
  };

  let settings = await readSettings();
  if (settings === undefined) {
    return EXIT_USAGE;
  }
  // A configuration switches on only what it names, so a rule brought in with
  // --rulesdir and left out of it is loaded and then never run - and a run
  // without it looks the same as one in which it found nothing.
  for (const [name, rule] of rules) {
    if (!BUILT_IN_RULES.includes(rule) && !isRuleEnabled(settings.configuration[name])) {
      diagnostics.report({
        level: 'notice',
        message: `The rule "${name}" from --rulesdir is not switched on in the configuration, so it does not run.`,
      });
    }
  }

  // Given more than once, the lists add up rather than the last one winning.
  const ignore = values.ignore?.flatMap((list) => list.split(',').map((pattern) => pattern.trim()));
  // Files are handed over as the walk finds them, so reading and checking
  // start on the first one rather than after the last. Only the patterns are
  // checked here; the walk itself happens once per pass.
  const {invalidPatterns, ignoredFiles} = findFeatureFileStream(positionals, ignore);

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
    // `gurkencheck -f json stats` reads as asking for the stats command, but
    // only a first argument is taken for one.
    if (invalidPatterns.includes('stats')) {
      diagnostics.report({
        level: 'detail',
        message: 'To run the stats command, put stats first: gurkencheck stats [options] [paths]',
      });
    }
    return EXIT_USAGE;
  }
  for (const file of ignoredFiles) {
    diagnostics.report({
      level: 'notice',
      message: `Skipped "${file}": it matches an ignore pattern.`,
    });
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

  // Discovery is a stream, and a stream can only be read once - so a run that
  // may happen more than once is given a fresh one each time.
  const discover = (): Sequence<string> =>
    findFeatureFileStream(positionals, ignore).files;

  let passes = 0;
  const checkOnce = async (): Promise<number> => {
    if (passes++ > 0) {
      settings = await readSettings();
      if (settings === undefined) {
        return EXIT_USAGE;
      }
    }
    const {configuration, language} = settings!;

    if (streaming !== undefined) {
      return await runStreaming(
        streaming,
        discover(),
        configuration,
        rules,
        language,
        diagnostics,
      );
    }

    let results;
    try {
      results = await lint(discover(), configuration, rules, {language});
    } catch (thrown) {
      diagnostics.report({
        level: 'error',
        message: `The run failed: ${thrown instanceof Error ? thrown.message : String(thrown)}`,
      });
      return EXIT_USAGE;
    }

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
    // Anything else handed back would be dropped without a word, and the
    // report you asked for would be missing from a run that passed.
    if (output !== undefined && typeof output !== 'string') {
      diagnostics.report({
        level: 'error',
        message: `The formatter failed: it returned ${output === null ? 'null' : typeof output} instead of a string. A formatter prints its output or returns it as a string.`,
      });
      return EXIT_USAGE;
    }
    if (output !== undefined && output !== '') {
      console.log(output);
    }

    return hasErrors(results) ? EXIT_LINT_ERRORS : EXIT_OK;
  };

  if (values.watch === true) {
    // Watching never fails: a run that found something is the normal state of
    // affairs while you are fixing it, and the exit code is only read once,
    // when you stop.
    const configPath = values.config ?? findConfigFile() ?? DEFAULT_CONFIG_FILE_NAME;
    return await watch(
      featureRoots(positionals),
      configPath,
      {
        diagnostics,
        ignore: DEFAULT_IGNORED_NAMES,
        // The configuration is watched even when it does not exist yet, so
        // writing one is noticed; the ignore file only when --ignore is not
        // there to overrule it.
        files: () => [
          configPath,
          ...(settings?.files ?? []),
          ...(ignore === undefined ? [DEFAULT_IGNORE_FILE_NAME] : []),
        ],
      },
      async () => {
        const code = await checkOnce();
        // A pass that finds nothing writes nothing, and on a screen still
        // showing the last pass's errors that reads as no change at all.
        if (code === EXIT_OK) {
          diagnostics.report({level: 'notice', message: 'No errors found.'});
        }
        return code;
      },
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

  // Linting and writing take turns in one loop, so what failed is recorded
  // rather than guessed at: a message blaming the formatter for a rule's
  // mistake sends you looking in the wrong place.
  let formatting = false;
  const format = async (hook: string, step: () => unknown): Promise<string | undefined> => {
    formatting = true;
    // A hook may be async; what it hands back has to be text to write.
    const written = await step();
    if (written !== undefined && typeof written !== 'string') {
      throw new Error(`${hook}() returned ${written === null ? 'null' : typeof written} instead of a string`);
    }
    formatting = false;
    return written;
  };

  let failed = false;
  try {
    formatting = true;
    const run = streaming();
    formatting = false;
    write(await format('start', () => run.start?.()));
    for await (const result of lintStream(files, configuration, rules, {language})) {
      failed ||= result.errors.some((error) => (error.severity ?? 'error') === 'error');
      write(await format('file', () => run.file(result)));
    }
    write(await format('end', () => run.end?.()));
  } catch (thrown) {
    const reason = thrown instanceof Error ? thrown.message : String(thrown);
    diagnostics.report({
      level: 'error',
      message: formatting ? `The formatter failed: ${reason}` : `The run failed: ${reason}`,
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

/**
 * Stops quietly once whoever reads the output has gone - `gurkencheck | head`
 * or quitting `less` early. Nothing written after that point can be read, so
 * the run ends there, as a command killed by SIGPIPE would.
 */
function stopWhenOutputCloses(): void {
  process.stdout.on('error', (thrown: NodeJS.ErrnoException) => {
    if (thrown.code === 'EPIPE') {
      process.exit(process.exitCode ?? EXIT_OK);
    }
    throw thrown;
  });
}

// Only take over the process when run as a command, not when imported.
if (isMainModule()) {
  stopWhenOutputCloses();
  process.exitCode = await main(process.argv.slice(2));
}
