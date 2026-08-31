import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  DEFAULT_FORMAT,
  STREAMING_FORMATTERS,
  getFormatter,
  getStreamingFormatter,
  loadFormatter,
  loadStreamingFormatter,
} from '../src/formatters/index.ts';
import type {StreamingFormatter} from '../src/formatters/index.ts';
import {toSarif} from '../src/formatters/sarif.ts';
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

// https://github.com/gherkin-lint/gherkin-lint/issues/81
test('json uses the shape eslint uses', () => {
  const output = capture(getFormatter('json')!, RESULTS);
  assert.deepEqual(JSON.parse(output), [
    {
      filePath: '/features/Login.feature',
      messages: [
        {
          ruleId: 'no-unnamed-scenarios',
          severity: 2,
          message: 'Missing Scenario name',
          line: 3,
        },
        {
          ruleId: 'no-trailing-spaces',
          severity: 2,
          message: 'Trailing spaces are not allowed',
          line: 12,
        },
      ],
      errorCount: 2,
      warningCount: 0,
    },
    {filePath: '/features/Clean.feature', messages: [], errorCount: 0, warningCount: 0},
  ]);
});

test('json counts warnings separately from errors', () => {
  const output = capture(getFormatter('json')!, [
    {
      filePath: '/a.feature',
      errors: [
        {line: 1, message: 'advice', rule: 'use-and', severity: 'warning'},
        {line: 2, message: 'a real problem', rule: 'no-empty-file'},
      ],
    },
  ]);
  const [file] = JSON.parse(output) as {errorCount: number; warningCount: number; messages: {severity: number}[]}[];
  assert.equal(file?.errorCount, 1);
  assert.equal(file?.warningCount, 1);
  assert.deepEqual(file?.messages.map((m) => m.severity), [1, 2]);
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

test('json carries the column through, and leaves it out when there is none', () => {
  const output = capture(getFormatter('json')!, WITH_COLUMNS);
  const [file] = JSON.parse(output) as {messages: {column?: number}[]}[];
  assert.equal(file?.messages[0]?.column, 5);
  assert.ok(!('column' in (file?.messages[1] ?? {})));
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
// The plan comes last: test points are written as the files are checked, so
// the count is only known once they have been. TAP 13 allows either end.
test('tap reports one test point per file, with a trailing plan', () => {
  const output = capture(getFormatter('tap')!, RESULTS);
  const lines = output.split('\n');
  assert.equal(lines[0], 'TAP version 13');
  assert.equal(lines.at(-1), '1..2');
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

// https://github.com/gherkin-lint/gherkin-lint/issues/263
test('sarif produces a 2.1.0 log naming the tool', () => {
  const log = toSarif(RESULTS, '/') as {
    version: string;
    runs: {tool: {driver: {name: string; version: string; rules: {id: string; helpUri: string}[]}}}[];
  };
  assert.equal(log.version, '2.1.0');
  const driver = log.runs[0]!.tool.driver;
  assert.equal(driver.name, 'gurkencheck');
  assert.match(driver.version, /^\d+\.\d+\.\d+/u);
});

test('sarif lists only the rules that found something, with a link to their page', () => {
  const log = toSarif(RESULTS, '/') as {runs: {tool: {driver: {rules: {id: string; helpUri: string}[]}}}[]};
  const rules = log.runs[0]!.tool.driver.rules;
  assert.deepEqual(rules.map((rule) => rule.id), ['no-trailing-spaces', 'no-unnamed-scenarios']);
  assert.match(rules[0]!.helpUri, /rules\/no-trailing-spaces\.html$/u);
});

test('sarif reports paths relative to the working directory', () => {
  const log = toSarif(RESULTS, '/') as {
    runs: {results: {locations: {physicalLocation: {artifactLocation: {uri: string}}}[]}[]}[];
  };
  const uri = log.runs[0]!.results[0]!.locations[0]!.physicalLocation.artifactLocation.uri;
  assert.equal(uri, 'features/Login.feature');
});

test('sarif carries the position as a region, and the severity as a level', () => {
  const log = toSarif(WITH_COLUMNS, '/') as {
    runs: {results: {level: string; locations: {physicalLocation: {region?: object}}[]}[]}[];
  };
  const [withColumn] = log.runs[0]!.results;
  assert.equal(withColumn?.level, 'error');
  assert.deepEqual(withColumn?.locations[0]?.physicalLocation.region, {startLine: 3, startColumn: 5});
});

test('sarif leaves out the region for a finding about a whole file', () => {
  const log = toSarif([{filePath: '/a.feature', errors: [{line: 0, message: 'x', rule: 'file-name'}]}], '/') as {
    runs: {results: {locations: {physicalLocation: {region?: object}}[]}[]}[];
  };
  assert.equal(log.runs[0]!.results[0]!.locations[0]!.physicalLocation.region, undefined);
});

test('sarif marks a warning as a warning', () => {
  const log = toSarif(
    [{filePath: '/a.feature', errors: [{line: 1, message: 'x', rule: 'use-and', severity: 'warning'}]}],
    '/',
  ) as {runs: {results: {level: string}[]}[]};
  assert.equal(log.runs[0]!.results[0]!.level, 'warning');
});

test('sarif is valid JSON when printed', () => {
  const output = capture(getFormatter('sarif')!, RESULTS);
  assert.equal((JSON.parse(output) as {version: string}).version, '2.1.0');
});

/** Drives a streaming formatter over the results, one file at a time. */
function stream(start: StreamingFormatter, results: readonly FileResult[]): string {
  const run = start();
  return [run.start?.() ?? '', ...results.map((result) => run.file(result)), run.end?.() ?? ''].join('');
}

test('the streaming formats are the ones that can be written as they go', () => {
  assert.deepEqual(Object.keys(STREAMING_FORMATTERS).sort(), ['stylish', 'tap']);
  // A single document with a root element and counts over the whole run has
  // nothing it can write early.
  for (const format of ['json', 'sarif', 'junit', 'xunit']) {
    assert.equal(getStreamingFormatter(format), undefined, `${format} should not stream`);
  }
});

test('streaming tap writes the same report the batch one does', () => {
  assert.equal(stream(getStreamingFormatter('tap')!, RESULTS).trimEnd(), capture(getFormatter('tap')!, RESULTS));
});

test('streaming tap numbers its test points as they arrive', () => {
  const run = getStreamingFormatter('tap')!();
  assert.equal(run.start?.(), 'TAP version 13\n');
  assert.match(run.file(RESULTS[0]!), /^not ok 1 - /u);
  assert.match(run.file(RESULTS[1]!), /^ok 2 - /u);
  assert.equal(run.end?.(), '1..2\n');
});

// Two runs at once must not number each other's test points.
test('each tap run counts on its own', () => {
  const first = getStreamingFormatter('tap')!();
  const second = getStreamingFormatter('tap')!();

  first.file(RESULTS[0]!);
  first.file(RESULTS[1]!);
  second.file(RESULTS[0]!);

  assert.equal(first.end?.(), '1..2\n');
  assert.equal(second.end?.(), '1..1\n');
});

test('streaming stylish writes byte for byte what the batch one does', () => {
  // capture() joins the lines console.log wrote, which drops the final break.
  assert.equal(
    stream(getStreamingFormatter('stylish')!, RESULTS).trimEnd(),
    capture(getFormatter('stylish')!, RESULTS).trimEnd(),
  );
});

test('streaming stylish writes nothing for a clean file', () => {
  const run = getStreamingFormatter('stylish')!();
  assert.equal(run.file({filePath: '/Clean.feature', errors: []}), '');
});

test('a custom formatter exporting startRun is used as a streaming one', async () => {
  const loaded = await loadStreamingFormatter('./test/formatters/streaming.mjs');
  assert.ok(loaded, 'the module exports startRun, so it should stream');
  assert.equal(stream(loaded, RESULTS), 'start|/features/Login.feature|/features/Clean.feature|end');
});

test('a custom formatter without startRun is left as a batch one', async () => {
  assert.equal(await loadStreamingFormatter('./test/formatters/batch.mjs'), undefined);
});
