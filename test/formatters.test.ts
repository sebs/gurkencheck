import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DEFAULT_FORMAT, getFormatter, loadFormatter} from '../src/formatters/index.ts';
import type {FileResult, Formatter} from '../src/index.ts';

const RESULTS: FileResult[] = [
  {
    filePath: '/features/Login.feature',
    errors: [
      {line: 3, message: 'Missing Scenario name', rule: 'no-unnamed-scenarios'},
      {line: 12, message: 'Trailing spaces are not allowed', rule: 'no-trailing-spaces'},
    ],
  },
  {filePath: '/features/Clean.feature', errors: []},
];

/** Runs a formatter and returns everything it wrote to stdout. */
function capture(formatter: Formatter, results: FileResult[]): string {
  const original = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  try {
    formatter(results);
  } finally {
    console.log = original;
  }
  return lines.join('\n');
}

// https://github.com/gherkin-lint/gherkin-lint/issues/117
// https://github.com/gherkin-lint/gherkin-lint/issues/80
test('results go to stdout, not stderr', () => {
  const wroteToStderr: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => wroteToStderr.push(args.map(String).join(' '));
  try {
    const output = capture(getFormatter('stylish')!, RESULTS);
    assert.notEqual(output, '');
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(wroteToStderr, []);
});

test('the default format is stylish', () => {
  assert.equal(getFormatter(undefined), getFormatter(DEFAULT_FORMAT));
});

test('an unknown format has no formatter', () => {
  assert.equal(getFormatter('yaml'), undefined);
});

test('json prints the results as a single JSON document', () => {
  const output = capture(getFormatter('json')!, RESULTS);
  assert.deepEqual(JSON.parse(output), RESULTS);
});

test('stylish lists each file with errors and skips clean ones', () => {
  const output = capture(getFormatter('stylish')!, RESULTS);
  assert.match(output, /Login\.feature/u);
  assert.doesNotMatch(output, /Clean\.feature/u);
  assert.match(output, /Missing Scenario name/u);
  assert.match(output, /no-trailing-spaces/u);
});

test('stylish lines up the message column', () => {
  const output = capture(getFormatter('stylish')!, RESULTS);
  const columns = output
    .split('\n')
    .filter((line) => line.includes('no-'))
    .map((line) => line.indexOf('no-'));
  assert.equal(new Set(columns).size, 1, 'rule names should start at the same column');
});

// https://github.com/gherkin-lint/gherkin-lint/issues/211
const WITH_COLUMNS: FileResult[] = [
  {
    filePath: '/features/Login.feature',
    errors: [
      {line: 3, column: 5, message: 'Missing Scenario name', rule: 'no-unnamed-scenarios'},
      {line: 12, message: 'New line at EOF(end of file) is required', rule: 'new-line-at-eof'},
    ],
  },
];

test('stylish shows line:column when the rule knows a column', () => {
  const output = capture(getFormatter('stylish')!, WITH_COLUMNS);
  assert.match(output, /\s3:5\s/u);
});

test('stylish shows the line alone when there is no column', () => {
  const output = capture(getFormatter('stylish')!, WITH_COLUMNS);
  assert.match(output, /\s12\s/u);
  assert.doesNotMatch(output, /12:/u);
});

test('stylish still lines the columns up when only some errors have one', () => {
  const output = capture(getFormatter('stylish')!, WITH_COLUMNS);
  const starts = output
    .split('\n')
    .filter((line) => line.includes('no-') || line.includes('new-line'))
    .map((line) => line.indexOf('Missing') + line.indexOf('New line') + 1);
  assert.equal(new Set(starts).size, 1, 'messages should start at the same column');
});

test('json carries the column through', () => {
  const output = capture(getFormatter('json')!, WITH_COLUMNS);
  assert.deepEqual(JSON.parse(output), WITH_COLUMNS);
});

test('junit includes the column in the location it prints', () => {
  const output = capture(getFormatter('junit')!, WITH_COLUMNS);
  assert.match(output, /\/features\/Login\.feature:3:5 \(no-unnamed-scenarios\)/u);
  assert.match(output, /\/features\/Login\.feature:12 \(new-line-at-eof\)/u);
});

// https://github.com/gherkin-lint/gherkin-lint/issues/114
test('loadFormatter returns a built-in by name', async () => {
  assert.equal(await loadFormatter('json'), getFormatter('json'));
  assert.equal(await loadFormatter(undefined), getFormatter(DEFAULT_FORMAT));
});

test('loadFormatter loads a formatter from a path', async () => {
  const formatter = await loadFormatter('./test/formatters/count.mjs');
  assert.equal(await formatter(RESULTS), '2 findings in 2 files');
});

test('loadFormatter accepts a CommonJS module exporting printResults', async () => {
  const formatter = await loadFormatter('./test/formatters/legacy.cjs');
  assert.match(capture(formatter as Formatter, RESULTS), /legacy formatter saw 2 files/u);
});

test('loadFormatter explains an unknown format', async () => {
  await assert.rejects(() => loadFormatter('yaml'), /Unsupported format "yaml"/u);
});

test('loadFormatter explains a module that is not a formatter', async () => {
  await assert.rejects(
    () => loadFormatter('./test/rulesdir/not-rules/notarule.mjs'),
    /does not export a formatter/u,
  );
});

// https://github.com/gherkin-lint/gherkin-lint/issues/95
test('tap reports one test point per file, with a plan', () => {
  const output = capture(getFormatter('tap')!, RESULTS);
  const lines = output.split('\n');
  assert.equal(lines[0], 'TAP version 13');
  assert.equal(lines[1], '1..2');
  assert.match(output, /^not ok 1 - \/features\/Login\.feature$/mu);
  assert.match(output, /^ok 2 - \/features\/Clean\.feature$/mu);
});

test('tap carries the findings in a YAML block', () => {
  const output = capture(getFormatter('tap')!, RESULTS);
  assert.match(output, /^ {2}---$/mu);
  assert.match(output, /^ {4}- severity: error$/mu);
  assert.match(output, /^ {6}message: 'Missing Scenario name'$/mu);
  assert.match(output, /^ {6}rule: 'no-unnamed-scenarios'$/mu);
  assert.match(output, /^ {2}\.\.\.$/mu);
});

test('tap passes a file whose findings are only warnings, and still says why', () => {
  const output = capture(getFormatter('tap')!, [
    {
      filePath: '/a.feature',
      errors: [{line: 1, message: 'gentle advice', rule: 'use-and', severity: 'warning'}],
    },
  ]);
  assert.match(output, /^ok 1 - \/a\.feature$/mu);
  assert.match(output, /severity: warning/u);
});

test('tap quotes a message containing an apostrophe', () => {
  const output = capture(getFormatter('tap')!, [
    {filePath: '/a.feature', errors: [{line: 1, message: "it's wrong", rule: 'r'}]},
  ]);
  assert.match(output, /message: 'it''s wrong'/u);
});

test('tap emits an empty plan when there is nothing to report', () => {
  assert.equal(capture(getFormatter('tap')!, []), 'TAP version 13\n1..0');
});

// https://github.com/gherkin-lint/gherkin-lint/issues/240
test('junit wraps the suites and counts the tests and failures', () => {
  const output = capture(getFormatter('junit')!, RESULTS);
  assert.match(output, /^<\?xml version="1\.0" encoding="utf-8"\?>/u);
  // two findings in Login, one placeholder test for the clean file
  assert.match(output, /<testsuites name="gurkencheck" tests="3" failures="2" errors="0">/u);
  assert.equal(output.match(/<testsuite /gu)?.length, 2);
});

test('junit makes each finding its own test case', () => {
  const output = capture(getFormatter('junit')!, RESULTS);
  assert.equal(output.match(/<testcase /gu)?.length, 3);
  assert.match(output, /<testcase name="no-unnamed-scenarios \(3\)" classname="features\.Login">/u);
  assert.match(output, /<failure message="Missing Scenario name" type="no-unnamed-scenarios">/u);
});

test('junit gives a clean file a passing test case', () => {
  const output = capture(getFormatter('junit')!, RESULTS);
  assert.match(output, /<testsuite name="\/features\/Clean\.feature" tests="1" failures="0"/u);
  assert.match(output, /<testcase name="\/features\/Clean\.feature" classname="features\.Clean"\/>/u);
});

test('junit reports a warning without failing the suite', () => {
  const output = capture(getFormatter('junit')!, [
    {
      filePath: '/a.feature',
      errors: [{line: 1, message: 'gentle advice', rule: 'use-and', severity: 'warning'}],
    },
  ]);
  assert.match(output, /failures="0"/u);
  assert.doesNotMatch(output, /<failure/u);
  assert.match(output, /<system-out>\/a\.feature:1 \(use-and\) gentle advice<\/system-out>/u);
});

test('xunit is still accepted as a name for the JUnit report', () => {
  assert.equal(getFormatter('xunit'), getFormatter('junit'));
});

test('junit escapes reserved characters in messages', () => {
  const output = capture(getFormatter('junit')!, [
    {filePath: '/a.feature', errors: [{line: 1, message: 'a < b & "c"', rule: 'r'}]},
  ]);
  assert.match(output, /message="a &lt; b &amp; &quot;c&quot;"/u);
  assert.match(output, /a &lt; b &amp; &quot;c&quot;<\/failure>/u);
});

test('junit output is well formed XML', () => {
  // A crude well-formedness check: every opened tag is closed in order.
  const output = capture(getFormatter('junit')!, RESULTS);
  const stack: string[] = [];
  for (const tag of output.matchAll(/<(\/?)([a-z-]+)[^>]*?(\/?)>/gu)) {
    const [, closing, name, selfClosing] = tag;
    if (selfClosing === '/' || name === 'xml') continue;
    if (closing === '/') {
      assert.equal(stack.pop(), name, `unexpected </${name}>`);
    } else {
      stack.push(name!);
    }
  }
  assert.deepEqual(stack, [], 'every tag should be closed');
});
