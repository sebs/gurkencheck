/**
 * Running the rules over a set of feature files.
 */
import path from 'node:path';
import {readAndParseFile} from './gherkin/parse.ts';
import {resetRules, runEnabledRules} from './rules.ts';
import type {Configuration, FileResult, RuleRegistry} from './types.ts';
import {sortBy} from './util/collections.ts';

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
): Promise<FileResult[]> {
  resetRules(rules);

  const parsed = await Promise.all(files.map((file) => readAndParseFile(file)));

  return parsed.map((result) => {
    const errors =
      result.errors.length > 0
        ? result.errors
        : runEnabledRules(result.feature, result.file, configuration, rules);

    return {
      filePath: path.resolve(result.file.relativePath),
      errors: sortBy(errors, (error) => error.line),
    };
  });
}

/** True when any file has at least one error. */
export function hasErrors(results: readonly FileResult[]): boolean {
  return results.some((result) => result.errors.length > 0);
}
