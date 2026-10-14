/**
 * Running the rules over a set of feature files.
 */
import path from 'node:path';
import {PARSER_RULES, readAndParseFiles} from './gherkin/parse.ts';
import {beginRun, finishRun, isRuleEnabled, runEnabledRules} from './rules.ts';
import {DIRECTIVES, UNKNOWN_DIRECTIVE, UNKNOWN_RULE_IN_DIRECTIVE, readSuppressions} from './suppressions.ts';
import {closest} from './util/suggest.ts';
import type {Suppressions} from './suppressions.ts';
import type {Configuration, FileResult, RuleError, RuleRegistry} from './types.ts';
import {sortBy} from './util/collections.ts';
import type {Sequence} from './util/stream.ts';

/** Stands in for a file whose directives were never read, and hides nothing. */
const EMPTY_SUPPRESSIONS: Suppressions = {isEmpty: true, named: [], misspelt: [], isSuppressed: () => false};

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
/**
 * A warning for each rule a directive names that does not exist. A typo there
 * switches nothing off, and the finding it was meant to hide stays with no
 * hint why. Added after the directives have been applied, so that a
 * directive cannot hide the warning about itself.
 */
function unknownRulesNamed(suppressions: Suppressions, rules: RuleRegistry): RuleError[] {
  const findings: RuleError[] = [];
  for (const {rule, line} of suppressions.named) {
    // The always-on rules, a crash and this warning itself are reported
    // whatever a directive says, so naming one switches nothing off either.
    const unswitchable =
      (PARSER_RULES as readonly string[]).includes(rule) || rule === UNKNOWN_RULE_IN_DIRECTIVE || rule === UNKNOWN_DIRECTIVE;
    if (!unswitchable && rules.has(rule)) {
      continue;
    }
    const meant = unswitchable ? undefined : closest(rule, rules.keys());
    findings.push({
      message: unswitchable
        ? `A directive names "${rule}", which cannot be switched off, so it switches nothing off`
        : meant === undefined
          ? `A directive names "${rule}", which is not a rule, so it switches nothing off`
          : `A directive names "${rule}", which is not a rule, so it switches nothing off. Did you mean "${meant}"?`,
      rule: UNKNOWN_RULE_IN_DIRECTIVE,
      line,
      severity: 'warning',
    });
  }
  return findings;
}

/** Freezes an object and everything reachable from it. */
function deepFreeze(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return;
  }
  Object.freeze(value);
  for (const key of Object.keys(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
}

/**
 * The directive checks' findings as loud as the configuration asks: warnings
 * unless it names the check, none for "off", errors for "on".
 */
function withSeverity(findings: RuleError[], configuration: Configuration): RuleError[] {
  return findings.flatMap((finding) => {
    const entry = configuration[finding.rule];
    const state = Array.isArray(entry) ? entry[0] : entry;
    if (state === 'off') return [];
    return [{...finding, severity: state === 'on' ? ('error' as const) : ('warning' as const)}];
  });
}

/** A warning for each comment that looks like a directive and is not one. */
function misspeltDirectives(suppressions: Suppressions): RuleError[] {
  return suppressions.misspelt.map(({directive, line}) => {
    // Directive names are long, so a misspelling may be a few letters more.
    const meant = closest(directive, DIRECTIVES, 6);
    return {
      message:
        meant === undefined
          ? `"${directive}" is not a directive, so it switches nothing off`
          : `"${directive}" is not a directive, so it switches nothing off. Did you mean "${meant}"?`,
      rule: UNKNOWN_DIRECTIVE,
      line,
      severity: 'warning' as const,
    };
  });
}

export async function* lintStream(
  files: Sequence<string>,
  configuration: Configuration,
  rules: RuleRegistry,
  options: LintOptions = {},
): AsyncGenerator<FileResult> {
  const run = beginRun(rules, configuration);
  // A rule that failed to start is reported at the end of the run, so the
  // results wait for it, as for a rule that reports across files.
  const held = reportsAcrossFiles(rules, configuration) || run.failedToStart.size > 0;

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
      // The directives are read before any rule runs, and the rules are
      // handed the file and its syntax tree frozen: a rule changing either -
      // lines.reverse() - changed which findings the directives hid, and
      // what every rule after it saw. Now such a rule fails as one that
      // crashed, and nothing else changes.
      suppressions = readSuppressions(result.file.lines, result.feature);
      deepFreeze(result.file);
      deepFreeze(result.feature);
      errors = await runEnabledRules(result.feature, result.file, configuration, rules, run);
      if (!suppressions.isEmpty) {
        errors = errors.filter((error) => !suppressions.isSuppressed(error));
        errors.push(
          ...withSeverity(unknownRulesNamed(suppressions, rules), configuration),
          ...withSeverity(misspeltDirectives(suppressions), configuration),
        );
      }
    }

    const fileResult: FileResult = {filePath: path.resolve(result.file.relativePath), errors};
    // Keyed by where the file is, so a finding at the end of the run names it
    // however it spells the path - as given, or absolute.
    byPath.set(path.resolve(result.file.relativePath), {result: fileResult, suppressions});

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
  // is seen at all; in a run of no files, against the directory it ran in,
  // as dropped it would leave a failure looking like a pass.
  for (const {filePath, ...error} of await finishRun(rules, configuration, run)) {
    if (filePath === undefined) {
      if (waiting.length === 0) {
        waiting.push({filePath: process.cwd(), errors: []});
      }
      waiting[0]!.errors.push(error);
      continue;
    }
    const target = byPath.get(path.resolve(filePath));
    if (target === undefined) {
      // A file this run did not check. Put on another file, it would carry
      // that file's name with a line and column from this one, and slip past
      // the directives of both - so it is reported under the file it names.
      const result: FileResult = {filePath: path.resolve(filePath), errors: [error]};
      byPath.set(result.filePath, {result, suppressions: EMPTY_SUPPRESSIONS});
      waiting.push(result);
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
