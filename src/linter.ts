/**
 * Running the rules over a set of feature files.
 */
import path from 'node:path';
import {readAndParseFiles} from './gherkin/parse.ts';
import {beginRun, finishRun, isRuleEnabled, runEnabledRules} from './rules.ts';
import {readSuppressions} from './suppressions.ts';
import type {Suppressions} from './suppressions.ts';
import type {Configuration, FileResult, RuleRegistry} from './types.ts';
import {sortBy} from './util/collections.ts';
import type {Sequence} from './util/stream.ts';

/** Stands in for a file whose directives were never read, and hides nothing. */
const EMPTY_SUPPRESSIONS: Suppressions = {isEmpty: true, isSuppressed: () => false};

export interface LintOptions {
  /**
   * The dialect to read a file in when it carries no `# language:` header,
   * for projects written entirely in one language.
   */
  language?: string;
  /**
   * How many files to read ahead of the one being checked. Left out, a
   * sensible default is used; there is rarely a reason to set it.
   */
  readAhead?: number;
}

/** True when a rule that only reports once every file has been seen is on. */
function reportsAcrossFiles(rules: RuleRegistry, configuration: Configuration): boolean {
  for (const rule of rules.values()) {
    if (rule.onRunEnd !== undefined && isRuleEnabled(configuration[rule.name])) {
      return true;
    }
  }
  return false;
}

/**
 * Lints every file, handing back each result as soon as it is final.
 *
 * Files are read concurrently but checked one after another, because rules
 * that look for duplicates across files need a predictable order. Results
 * come in the order the files were given.
 *
 * A rule that reports across files - two files sharing a name - cannot know
 * what it has found until every file has been seen, so switching one on holds
 * every result back until the end. That is the honest cost of the question it
 * answers, not something to work around: a result handed over early would
 * have to be taken back. With no such rule on, each result arrives as its
 * file is checked.
 *
 * Files are read ahead of being checked, a bounded number at a time, so the
 * next one is on its way while this one is being checked without the whole
 * suite being held in memory at once.
 *
 * Stopping early - `break` in a `for await` - stops the reading as well as
 * the checking, rather than running on to the last file.
 */
export async function* lintStream(
  files: Sequence<string>,
  configuration: Configuration,
  rules: RuleRegistry,
  options: LintOptions = {},
): AsyncGenerator<FileResult> {
  const run = beginRun(rules, configuration);
  const held = reportsAcrossFiles(rules, configuration);

  const waiting: FileResult[] = [];
  /** Where to put a finding that names a file, and what may hide it there. */
  const byPath = new Map<string, {result: FileResult; suppressions: Suppressions}>();

  for await (const result of readAndParseFiles(files, {
    language: options.language,
    readAhead: options.readAhead,
  })) {
    // Parse errors are not suppressible: the file could not be read, so
    // hiding the message would leave nothing in its place.
    let errors = result.errors;
    let suppressions = EMPTY_SUPPRESSIONS;

    if (errors.length === 0) {
      errors = await runEnabledRules(result.feature, result.file, configuration, rules, run);
      suppressions = readSuppressions(result.file.lines);
      if (!suppressions.isEmpty) {
        errors = errors.filter((error) => !suppressions.isSuppressed(error));
      }
    }

    const fileResult: FileResult = {filePath: path.resolve(result.file.relativePath), errors};
    byPath.set(result.file.relativePath, {result: fileResult, suppressions});

    if (held) {
      waiting.push(fileResult);
    } else {
      fileResult.errors = sortBy(fileResult.errors, (error) => error.line);
      yield fileResult;
    }
  }

  // What only the whole run could show: two files sharing a name, and the
  // like. A finding naming no file is about the run itself - a rule that
  // failed looking back over it - and goes against the first file so that it
  // is seen at all.
  for (const {filePath, ...error} of await finishRun(rules, configuration, run)) {
    const target = filePath === undefined ? undefined : byPath.get(filePath);
    if (target === undefined) {
      waiting[0]?.errors.push(error);
      continue;
    }
    if (!target.suppressions.isSuppressed(error)) {
      target.result.errors.push(error);
    }
  }

  for (const result of waiting) {
    result.errors = sortBy(result.errors, (error) => error.line);
    yield result;
  }
}

/**
 * Lints every file and returns one result per file, in the order given.
 *
 * The whole run at once. For results as they are ready - a progress line, an
 * editor, stopping at the first error - use `lintStream`.
 */
export async function lint(
  files: Sequence<string>,
  configuration: Configuration,
  rules: RuleRegistry,
  options: LintOptions = {},
): Promise<FileResult[]> {
  const results: FileResult[] = [];
  for await (const result of lintStream(files, configuration, rules, options)) {
    results.push(result);
  }
  return results;
}

/** True when any file has a finding serious enough to fail the run. */
export function hasErrors(results: readonly FileResult[]): boolean {
  return results.some((result) =>
    result.errors.some((error) => (error.severity ?? 'error') === 'error'),
  );
}

/** How many findings there are of each severity. */
export function countBySeverity(results: readonly FileResult[]): {
  errors: number;
  warnings: number;
} {
  let errors = 0;
  let warnings = 0;
  for (const result of results) {
    for (const error of result.errors) {
      if ((error.severity ?? 'error') === 'warning') {
        warnings++;
      } else {
        errors++;
      }
    }
  }
  return {errors, warnings};
}
