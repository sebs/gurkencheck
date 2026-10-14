#!/usr/bin/env node
/**
 * The gurkencheck command line interface.
 */
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {describeArgumentError, optionThatIsFileMessage, optionsThatAreFiles} from './util/args.ts';
import {DEFAULT_CONFIG_FILE_NAME, findConfigFile, readConfiguration, setIn} from './config-parser.ts';
import {EXIT_LINT_ERRORS, EXIT_OK, EXIT_USAGE} from './exit-codes.ts';
import {
  DEFAULT_IGNORE_FILE_NAME,
  describeInvalidPattern,
  featureRoots,
  findFeatureFileStream,
  findFeatureFiles,
  findIgnoreFile,
  unmatchedMessages,
} from './feature-finder.ts';
import {watch} from './watch.ts';
import {
  DEFAULT_FORMAT,
  FORMATTERS,
  loadFormatter,
  loadStreamingFormatter,
} from './formatters/index.ts';
import {isKnownLanguage, unknownLanguageMessage} from './gherkin/dialects.ts';
import {countBySeverity, hasErrors, lint, lintStream} from './linter.ts';
import {SILENT, TO_STDERR} from './diagnostics.ts';
import type {Diagnostics} from './diagnostics.ts';
import {loadRules} from './rules.ts';
import {BUILT_IN_RULES} from './rules/index.ts';
import type {StreamingFormatter} from './formatters/index.ts';
import type {Configuration, RuleRegistry} from './types.ts';
import type {Sequence} from './util/stream.ts';
import {runStats} from './stats/command.ts';
import {version} from './version.ts';
import {stillWaitingFor, waitFor} from './util/waiting.ts';
import {asText, reasonOf} from './util/thrown.ts';

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

  const filesAsOptions = optionsThatAreFiles(argv);
  if (filesAsOptions.length > 0) {
    for (const argument of filesAsOptions) {
      diagnostics.report({level: 'error', message: optionThatIsFileMessage(argument, 'gurkencheck')});
    }
    return EXIT_USAGE;
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
      message: reasonOf(thrown),
    });
    return EXIT_USAGE;
  }

  /**
   * The configuration and the dialect it asks for, or `undefined` once what
   * is wrong with them has been reported. Read again on every pass of a
   * watch, since a change to the configuration is one of the things it
   * checks again for.
   */
  /** Every configuration file read, for a watch to keep an eye on. */
  const configurationFiles = new Set<string>();
  const readSettings = async (): Promise<
    {configuration: Configuration; language: string | undefined; files?: string[]} | undefined
  > => {
    const read = await readConfiguration(values.config, rules);
    // Kept across passes, broken ones included: a watch has to notice the
    // fix to a file it was told is broken, which a list read afresh from a
    // configuration that failed would leave out.
    for (const file of read.files ?? []) {
      configurationFiles.add(file);
    }
    if (!read.ok) {
      diagnostics.report({level: 'error', message: read.message, details: read.details});
      return undefined;
    }
    const language = values.language ?? read.language;
    if (language !== undefined && !isKnownLanguage(language)) {
      // Said where it came from: a flag is fixed differently from a file.
      const from =
        values.language === undefined && read.languageSource !== undefined
          ? setIn(read.languageSource)
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
  // A watch carries on over a configuration it cannot use, as it does once
  // running: the point is to be told when it has been fixed.
  if (settings === undefined && values.watch !== true) {
    return EXIT_USAGE;
  }
  // A configuration switches on only what it names, so a rule brought in with
  // --rulesdir and left out of it is loaded and then never run - and a run
  // without it looks the same as one in which it found nothing. One the
  // configuration names, even as off, is where somebody meant it to be.
  for (const [name, rule] of settings === undefined ? [] : rules) {
    // Its own entries only: a rule called toString found the one every
    // object has, and was taken for configured.
    if (!BUILT_IN_RULES.includes(rule) && !Object.hasOwn(settings!.configuration, name)) {
      diagnostics.report({
        level: 'notice',
        message: `The rule "${name}" from --rulesdir is not in the configuration, so it does not run.`,
      });
    }
  }

  // Given more than once, the lists add up rather than the last one winning.
  const ignore = values.ignore?.flatMap((list) => list.split(',').map((pattern) => pattern.trim()));
  // Files are handed over as the walk finds them, so reading and checking
  // start on the first one rather than after the last. Only the patterns are
  // checked here; the walk itself happens once per pass.
  let initialSearch;
  try {
    initialSearch = findFeatureFileStream(positionals, ignore);
  } catch (thrown) {
    diagnostics.report({level: 'error', message: reasonOf(thrown)});
    return EXIT_USAGE;
  }
  const {invalidPatterns, ignoredFiles} = initialSearch;

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
      message: reasonOf(thrown),
    });
    return EXIT_USAGE;
  }

  // Discovery is a stream, and a stream can only be read once - so a run that
  // may happen more than once is given a fresh one each time.
  let search: ReturnType<typeof findFeatureFileStream> | undefined;
  /** The files the last search found, as absolute paths, for a watch. */
  let found = new Set<string>();
  const discover = (): Sequence<string> => {
    search = findFeatureFileStream(positionals, ignore);
    found = new Set();
    return noting(search.files, found);
  };
  /**
   * True when a run would check this feature file: one the last pass did, or
   * one a search finds now - a file new since then. A file that has gone and
   * was not checked changes nothing.
   */
  const wouldCheck = (absolutePath: string): boolean => {
    if (found.has(absolutePath)) {
      return true;
    }
    if (!fs.existsSync(absolutePath)) {
      return false;
    }
    try {
      return findFeatureFiles(positionals, ignore).files.some((file) => path.resolve(file) === absolutePath);
    } catch {
      return true;
    }
  };

  /**
   * One pass, then what the walk could not read. A directory passed over
   * without a word left its files unchecked and the run clean, so it makes
   * the run one that could not do what it was asked.
   */
  const checkOnce = async (): Promise<number> => {
    const code = await checkFiles();
    const unreadable = search?.unreadable ?? [];
    for (const {directory, reason} of unreadable) {
      diagnostics.report({level: 'error', message: `Could not read the directory "${directory}": ${reason}.`});
    }
    // A glob with a typo in it, or a directory holding no feature files,
    // checked nothing - and a run that checked nothing is not a clean one.
    const unmatched = unmatchedMessages(search ?? {unmatched: [], allIgnored: []}, positionals);
    for (const message of unmatched) {
      diagnostics.report({level: 'error', message});
    }
    // Checked before the first pass too, but a watch runs on: a path deleted
    // since is said to be gone, rather than a pass over nothing reading as a
    // clean one.
    const invalid = search?.invalidPatterns ?? [];
    for (const pattern of invalid) {
      diagnostics.report({level: 'error', message: describeInvalidPattern(pattern)});
    }
    return unreadable.length > 0 || unmatched.length > 0 || invalid.length > 0 ? EXIT_USAGE : code;
  };

  /**
   * True when the search could not do what it was asked - a path matched
   * nothing, a directory could not be read. Such a run exits 2, and writes no
   * report: an empty SARIF log or JUnit file reads as a clean result to the
   * tool it is handed to, and code scanning would close every open alert.
   */
  const searchFailed = (): boolean =>
    (search?.unreadable.length ?? 0) > 0 ||
    (search?.invalidPatterns.length ?? 0) > 0 ||
    unmatchedMessages(search ?? {unmatched: [], allIgnored: []}, positionals).length > 0;

  let passes = 0;
  /** How many warnings the last pass reported, for the notice after it. */
  let warningsThisPass = 0;
  const checkFiles = async (): Promise<number> => {
    warningsThisPass = 0;
    if (passes++ > 0) {
      settings = await readSettings();
    }
    if (settings === undefined) {
      return EXIT_USAGE;
    }
    const {configuration, language} = settings;

    if (streaming !== undefined) {
      return await runStreaming(
        streaming,
        discover(),
        configuration,
        rules,
        language,
        diagnostics,
        (count) => {
          warningsThisPass = count;
        },
        () => !searchFailed(),
      );
    }

    let results;
    try {
      results = await lint(discover(), configuration, rules, {language});
    } catch (thrown) {
      diagnostics.report({
        level: 'error',
        message: `The run failed: ${reasonOf(thrown)}`,
      });
      return EXIT_USAGE;
    }

    if (searchFailed()) {
      return EXIT_USAGE;
    }

    // The verdict is taken before a formatter sees the results: it is handed
    // the same objects, and one emptying result.errors as it printed them
    // turned a run with errors into one that passed.
    const failed = hasErrors(results);
    warningsThisPass = countBySeverity(results).warnings;

    // A formatter may print the output itself or hand it back as a string.
    let output;
    try {
      output = await waitFor('the formatter', formatter!(results, {rules: new Map(rules)}));
    } catch (thrown) {
      diagnostics.report({
        level: 'error',
        message: `The formatter failed: ${reasonOf(thrown)}`,
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

    return failed ? EXIT_LINT_ERRORS : EXIT_OK;
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
        // A change to a feature file the run would not check - beside the
        // ones named, outside the glob, ignored - is none of its business.
        checks: wouldCheck,
        // The configuration is watched even when it does not exist yet, so
        // writing one is noticed; the ignore file only when --ignore is not
        // there to overrule it.
        files: () => [
          configPath,
          ...configurationFiles,
          ...(ignore === undefined ? [findIgnoreFile() ?? DEFAULT_IGNORE_FILE_NAME] : []),
        ],
      },
      async () => {
        const code = await checkOnce();
        // A pass that finds nothing writes nothing, and on a screen still
        // showing the last pass's errors that reads as no change at all.
        if (code === EXIT_OK) {
          // Said under a pass that may have just listed warnings, so they are
          // counted in: "No errors found." alone read as nothing found.
          const warnings = warningsThisPass;
          diagnostics.report({
            level: 'notice',
            message:
              warnings === 0
                ? 'No errors found.'
                : `No errors found, ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}.`,
          });
        }
        return code;
      },
    );
  }

  return await checkOnce();
}

/** The files as they go by, each noted in `seen` as an absolute path. */
async function* noting(files: Sequence<string>, seen: Set<string>): AsyncGenerator<string> {
  for await (const file of files) {
    seen.add(path.resolve(file));
    yield file;
  }
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
  onWarnings: (count: number) => void = () => undefined,
  complete: () => boolean = () => true,
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
    // A hook may be async; what it hands back has to be text to write, or
    // nothing - undefined or null alike, from any hook.
    const written = await waitFor(`the formatter's ${hook}()`, step());
    if (written !== undefined && written !== null && typeof written !== 'string') {
      throw new Error(`${hook}() returned ${typeof written} instead of a string`);
    }
    formatting = false;
    return written ?? undefined;
  };

  let failed = false;
  let warnings = 0;
  try {
    formatting = true;
    // A copy: the run's own registry, handed over, could be pruned by the
    // formatter, and the rules taken out would stop running.
    const run = streaming({rules: new Map(rules)});
    formatting = false;
    // The preamble waits for the first file, and the trailer is left off a
    // run that could not search what it was asked: such a run is no report,
    // and a TAP stream without its plan is one a harness knows to be broken.
    let started = false;
    const start = async (): Promise<void> => {
      if (!started) {
        started = true;
        write(await format('start', () => run.start?.()));
      }
    };
    for await (const result of lintStream(files, configuration, rules, {language})) {
      failed ||= result.errors.some((error) => (error.severity ?? 'error') === 'error');
      warnings += result.errors.filter((error) => error.severity === 'warning').length;
      await start();
      write(await format('file', () => run.file(result)));
    }
    if (complete()) {
      await start();
      write(await format('end', () => run.end?.()));
    }
  } catch (thrown) {
    const reason = reasonOf(thrown);
    diagnostics.report({
      level: 'error',
      message: formatting ? `The formatter failed: ${reason}` : `The run failed: ${reason}`,
    });
    return EXIT_USAGE;
  }

  onWarnings(warnings);
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
    // Line by line: a line break inside a message is written out, not kept.
    const text = thrown instanceof Error ? (thrown.stack ?? thrown.message) : asText(thrown);
    for (const line of text.split('\n')) {
      TO_STDERR.report({level: 'detail', message: line});
    }
    return EXIT_USAGE;
  }
}

/**
 * Stops writing, quietly, once whoever reads the output has gone - `gurkencheck
 * | head`, or quitting `less` early. Nothing written after that can be read,
 * so the rest is dropped, but the run goes on to its end: exiting there, as
 * this once did, ended it with 0 before the code saying what it found was
 * set, and under pipefail a run with errors went green.
 */
function stopWritingWhenOutputCloses(): void {
  process.stdout.on('error', (thrown: NodeJS.ErrnoException) => {
    if (thrown.code === 'EPIPE') {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      return;
    }
    throw thrown;
  });
}

/**
 * Ends the run as one that could not run when something fails outside it -
 * a promise a plugin left to reject with nobody waiting, an exception thrown
 * from a timer. Node would end it with 1, the code for "a rule was broken",
 * whether or not one was, and often with no report at all.
 */
function failOnStrayErrors(): void {
  const fail = (thrown: unknown): void => {
    TO_STDERR.report({
      level: 'error',
      message: `Something failed outside the run, most likely in a custom rule or formatter: ${
        reasonOf(thrown)
      }`,
    });
    ended = true;
    process.exit(EXIT_USAGE);
  };
  process.on('unhandledRejection', fail);
  process.on('uncaughtException', fail);
}

/** True once the run has ended, one way or the other. */
let ended = false;

/**
 * Says so when the run never finished: a custom rule or formatter returned a
 * promise that never settles, node found nothing left to do, and ended the
 * process with 13 - a code gurkencheck does not use - and a warning about
 * its own source rather than the plugin's.
 */
function failWhenNeverFinished(): void {
  process.on('exit', () => {
    if (ended) {
      return;
    }
    const waited = stillWaitingFor();
    TO_STDERR.report({
      level: 'error',
      message:
        waited.length > 0
          ? `The run never finished: ${waited.join(', ')} returned a promise that never settles.`
          : 'The run never finished: something it waited for never settled, most likely a promise from a custom rule or formatter.',
    });
    process.exitCode = EXIT_USAGE;
  });
}

// Only take over the process when run as a command, not when imported.
if (isMainModule()) {
  failOnStrayErrors();
  failWhenNeverFinished();
  stopWritingWhenOutputCloses();
  // Not awaited at the top level: node takes a top-level await that never
  // settles for its own failure, and warns about it before anything here can.
  void main(process.argv.slice(2)).then((code) => {
    ended = true;
    process.exitCode = code;
  });
}
