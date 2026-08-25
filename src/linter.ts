/**
 * Running the rules over a set of feature files.
 */
import path from 'node:path';
import {readAndParseFile} from './gherkin/parse.ts';
import {resetRules, runEnabledRules} from './rules.ts';
import {readSuppressions} from './suppressions.ts';
import type {Configuration, FileResult, RuleRegistry} from './types.ts';
import {sortBy} from './util/collections.ts';

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
  resetRules(rules);

  const parsed = await Promise.all(
    files.map((file) => readAndParseFile(file, options.language)),
  );
  const results: FileResult[] = [];

  for (const result of parsed) {
    // Parse errors are not suppressible: the file could not be read, so
    // hiding the message would leave nothing in its place.
    let errors = result.errors;

    if (errors.length === 0) {
      errors = await runEnabledRules(result.feature, result.file, configuration, rules);
      const suppressions = readSuppressions(result.file.lines);
      if (!suppressions.isEmpty) {
        errors = errors.filter((error) => !suppressions.isSuppressed(error));
      }
    }

    results.push({
      filePath: path.resolve(result.file.relativePath),
      errors: sortBy(errors, (error) => error.line),
    });
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
