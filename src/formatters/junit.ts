/**
 * JUnit XML, the report format CI servers such as Jenkins and TeamCity read.
 *
 * Each file becomes a test suite and each finding a test case, so a build
 * shows one failing test per problem with its message and position, rather
 * than one opaque failure per file. A file with nothing to report still
 * contributes a passing test case, so the report says what was checked.
 *
 * A warning does not fail the run, so it is reported as a passing test case
 * carrying its message, rather than as a failure the build would trip over.
 */
import path from 'node:path';
import type {FileResult, RuleError} from '../types.ts';
import {attributes, escapeXml, indent, XML_DECLARATION} from '../util/xml.ts';

function severityOf(error: RuleError): string {
  return error.severity ?? 'error';
}

/** `features/Login.feature` -> `features.Login`, for grouping in CI. */
function classNameFor(filePath: string): string {
  return filePath
    .replace(/\.[^./\\]+$/, '')
    .split(/[/\\]/)
    .filter((part) => part !== '' && part !== '.')
    .join('.');
}

/**
 * The path to show for a file: relative to the working directory, as a CI
 * server shows the repository, so suites read `features/Login.feature` and
 * group as `features.Login` rather than by where the build machine keeps its
 * checkout. A file outside the working directory keeps its absolute path.
 */
function displayPath(filePath: string, cwd: string): string {
  const relative = path.relative(cwd, filePath);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return filePath;
  }
  return relative.split(path.sep).join('/');
}

function positionOf(error: RuleError): string {
  return error.column === undefined ? `${error.line}` : `${error.line}:${error.column}`;
}

function testCase(filePath: string, error: RuleError): string {
  const open = `<testcase${attributes({
    name: `${error.rule} (${positionOf(error)})`,
    classname: classNameFor(filePath),
  })}>`;
  const detail = escapeXml(`${filePath}:${positionOf(error)} (${error.rule}) ${error.message}`);

  const body =
    severityOf(error) === 'warning'
      ? `<system-out>${detail}</system-out>`
      : `<failure${attributes({message: error.message, type: error.rule})}>${detail}</failure>`;

  return `${open}\n${indent(body, 1)}\n</testcase>`;
}

function testSuite(result: FileResult, cwd: string): string {
  const filePath = displayPath(result.filePath, cwd);
  const failures = result.errors.filter((error) => severityOf(error) === 'error').length;
  const cases =
    result.errors.length > 0
      ? result.errors.map((error) => testCase(filePath, error))
      : [
          `<testcase${attributes({
            name: filePath,
            classname: classNameFor(filePath),
          })}/>`,
        ];

  const open = `<testsuite${attributes({
    name: filePath,
    tests: Math.max(result.errors.length, 1),
    failures,
    errors: 0,
    skipped: 0,
  })}>`;

  return `${open}\n${indent(cases.join('\n'), 1)}\n</testsuite>`;
}

/** Renders the results as a JUnit report. */
export function format(results: readonly FileResult[], cwd: string = process.cwd()): string {
  const tests = results.reduce((total, result) => total + Math.max(result.errors.length, 1), 0);
  const failures = results.reduce(
    (total, result) =>
      total + result.errors.filter((error) => severityOf(error) === 'error').length,
    0,
  );

  const body = [
    `<testsuites${attributes({name: 'gurkencheck', tests, failures, errors: 0})}>`,
    ...results.map((result) => indent(testSuite(result, cwd), 1)),
    '</testsuites>',
  ].join('\n');

  return `${XML_DECLARATION}\n${body}`;
}

/** Writes the JUnit report to stdout. */
export function printResults(results: readonly FileResult[]): void {
  console.log(format(results));
}
