import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DEFAULT_FORMAT, getFormatter} from '../src/formatters/index.ts';
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

/** Runs a formatter and returns everything it wrote to stderr. */
function capture(formatter: Formatter, results: FileResult[]): string {
  const original = console.error;
  const lines: string[] = [];
  console.error = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  try {
    formatter(results);
  } finally {
    console.error = original;
  }
  return lines.join('\n');
}

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

test('xunit produces one testcase per file and one error per violation', () => {
  const output = capture(getFormatter('xunit')!, RESULTS);
  assert.match(output, /^<\?xml version="1\.0" encoding="utf-8"\?>/u);
  assert.equal(output.match(/<testcase /gu)?.length, 2);
  assert.equal(output.match(/<error /gu)?.length, 2);
  assert.match(output, /type="gurkencheck-error"/u);
  assert.match(output, /<!\[CDATA\[\/features\/Login\.feature:3 \(no-unnamed-scenarios\)/u);
});

test('xunit escapes reserved characters in messages', () => {
  const output = capture(getFormatter('xunit')!, [
    {filePath: '/a.feature', errors: [{line: 1, message: 'a < b & "c"', rule: 'r'}]},
  ]);
  assert.match(output, /message="a &lt; b &amp; &quot;c&quot;"/u);
});
