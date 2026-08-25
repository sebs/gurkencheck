/**
 * SARIF 2.1.0 output.
 *
 * SARIF is the format code scanning tools agree on, so a report in it can be
 * uploaded to GitHub code scanning and shown inline on a pull request without
 * anything in between.
 *
 * See https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 */
import path from 'node:path';
import type {FileResult, RuleError} from '../types.ts';
import {version} from '../version.ts';

const SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';
const SARIF_VERSION = '2.1.0';
const DOCUMENTATION = 'https://gurkencheck.github.io/gurkencheck/';

/** SARIF's levels, which happen to line up with ours. */
const LEVEL = {error: 'error', warning: 'warning'} as const;

function levelOf(error: RuleError): string {
  return LEVEL[error.severity ?? 'error'];
}

/**
 * Paths relative to the working directory, with forward slashes.
 *
 * Code scanning matches a result to a file in the repository by this URI, so
 * an absolute path from whichever machine ran the linter would match nothing.
 */
function uriFor(filePath: string, cwd: string): string {
  const relative = path.relative(cwd, filePath);
  return relative.split(path.sep).join('/');
}

function toResult(result: FileResult, error: RuleError, cwd: string): unknown {
  const physicalLocation: Record<string, unknown> = {
    artifactLocation: {uri: uriFor(result.filePath, cwd)},
  };

  // SARIF counts from 1, so a finding about a whole file carries no region
  // rather than a line 0 that does not exist.
  if (error.line > 0) {
    const region: Record<string, number> = {startLine: error.line};
    if (error.column !== undefined) {
      region['startColumn'] = error.column;
    }
    physicalLocation['region'] = region;
  }

  return {
    ruleId: error.rule,
    level: levelOf(error),
    message: {text: error.message},
    locations: [{physicalLocation}],
  };
}

/** Builds the SARIF log for a set of results. */
export function toSarif(results: readonly FileResult[], cwd: string = process.cwd()): unknown {
  const findings = results.flatMap((result) =>
    result.errors.map((error) => toResult(result, error, cwd)),
  );

  // Every rule that actually produced a finding, so the report explains what
  // each id means and where to read about it.
  const ruleIds = [...new Set(results.flatMap((r) => r.errors.map((error) => error.rule)))].sort();

  return {
    $schema: SCHEMA,
    version: SARIF_VERSION,
    runs: [
      {
        tool: {
          driver: {
            name: 'gurkencheck',
            informationUri: DOCUMENTATION,
            version: version(),
            rules: ruleIds.map((id) => ({
              id,
              helpUri: `${DOCUMENTATION}rules/${id}.html`,
            })),
          },
        },
        results: findings,
      },
    ],
  };
}

/** Writes the SARIF log to stdout. */
export function printResults(results: readonly FileResult[]): void {
  console.log(JSON.stringify(toSarif(results), null, 2));
}
