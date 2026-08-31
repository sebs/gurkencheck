/**
 * Running the rules over a set of feature files.
 */
import path from 'node:path';
import {readAndParseFile} from './gherkin/parse.ts';
import {beginRun, finishRun, runEnabledRules} from './rules.ts';
import {readSuppressions} from './suppressions.ts';
import type {Suppressions} from './suppressions.ts';
import type {Configuration, FileResult, RuleRegistry} from './types.ts';
import {sortBy} from './util/collections.ts';

/** Stands in for a file whose directives were never read, and hides nothing. */
const EMPTY_SUPPRESSIONS: Suppressions = {isEmpty: true, isSuppressed: () => false};

export interface LintOptions {
  /**
   * The dialect to read a file in when it carries no `# language:` header,
   * for projects written entirely in one language.
   */
  language?: string;
}

/**
 * Lints every file and returns one result per file, in the order given.
 *
 * Files are read concurrently but checked one after another, because rules
 * that look for duplicates across files need a predictable order.
 */
export async function lint(
  files: readonly string[],
  configuration: Configuration,
  rules: RuleRegistry,
  options: LintOptions = {},
): Promise<FileResult[]> {
  const run = beginRun(rules, configuration);

  const parsed = await Promise.all(
    files.map((file) => readAndParseFile(file, options.language)),
  );
  const results: FileResult[] = [];
  /** Where to put a finding that names a file, and what may hide it there. */
  const byPath = new Map<string, {result: FileResult; suppressions: Suppressions}>();

  for (const result of parsed) {
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
    results.push(fileResult);
    byPath.set(result.file.relativePath, {result: fileResult, suppressions});
  }

  // What only the whole run could show: two files sharing a name, and the
  // like. A finding naming no file is about the run itself - a rule that
  // failed looking back over it - and goes against the first file so that it
  // is seen at all.
  for (const {filePath, ...error} of await finishRun(rules, configuration, run)) {
    const target = filePath === undefined ? undefined : byPath.get(filePath);
    if (target === undefined) {
      results[0]?.errors.push(error);
      continue;
    }
    if (!target.suppressions.isSuppressed(error)) {
      target.result.errors.push(error);
    }
  }

  for (const result of results) {
    result.errors = sortBy(result.errors, (error) => error.line);
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
