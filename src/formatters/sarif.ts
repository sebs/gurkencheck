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
import {pathToFileURL} from 'node:url';
import {ALWAYS_ON_RULES} from '../gherkin/parse.ts';
import {BUILT_IN_RULES} from '../rules/index.ts';
import type {FileResult, RuleError} from '../types.ts';
import {version} from '../version.ts';

const SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';
const SARIF_VERSION = '2.1.0';
const DOCUMENTATION = 'https://sebs.github.io/gurkencheck/';

/** The rules with a page on the documentation site. */
const DOCUMENTED_RULES = new Set<string>([
  ...BUILT_IN_RULES.map((rule) => rule.name),
  ...ALWAYS_ON_RULES,
]);

/** SARIF's levels, which happen to line up with ours. */
const LEVEL = {error: 'error', warning: 'warning'} as const;

function levelOf(error: RuleError): string {
  return LEVEL[error.severity ?? 'error'];
}

/**
 * Paths relative to the working directory, with forward slashes, as a URI.
 *
 * Code scanning matches a result to a file in the repository by this URI, so
 * an absolute path from whichever machine ran the linter would match nothing.
 * It is a URI rather than a path, so each segment is percent-encoded: a `#`
 * in a file name would otherwise start a fragment, and `%20` read as a space.
 *
 * A file outside the working directory is not in the repository as code
 * scanning sees it, so a relative `../` path would match nothing either; it
 * gets an absolute `file:` URI, which at least names the file exactly.
 */
function uriFor(filePath: string, cwd: string): string {
  const relative = path.relative(cwd, filePath);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return pathToFileURL(path.resolve(cwd, filePath)).href;
  }
  return relative.split(path.sep).map(encodeURIComponent).join('/');
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
            // Only the rules documented on the site get a link: one to a
            // custom rule's page, or to unexpected-error's, would be a 404.
            rules: ruleIds.map((id) =>
              DOCUMENTED_RULES.has(id) ? {id, helpUri: `${DOCUMENTATION}rules/${id}.html`} : {id},
            ),
          },
        },
        // Columns count characters, as the Gherkin parser does, not the
        // UTF-16 units some tools assume.
        columnKind: 'unicodeCodePoints',
        results: findings,
      },
    ],
  };
}

/** Writes the SARIF log to stdout. */
export function printResults(results: readonly FileResult[]): void {
  console.log(JSON.stringify(toSarif(results), null, 2));
}
