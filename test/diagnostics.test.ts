/**
 * Saying something without deciding where it goes.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {SILENT, TO_STDERR, collectDiagnostics} from '../src/diagnostics.ts';
import {runStats} from '../src/stats/command.ts';
import {run} from '../src/main.ts';

/** Everything written to the console while the body runs. */
function captured(body: () => void): {out: string[]; err: string[]} {
  const out: string[] = [];
  const err: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => out.push(args.map(String).join(' '));
  console.error = (...args: unknown[]) => err.push(args.map(String).join(' '));
  try {
    body();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  return {out, err};
}

test('SILENT writes nothing anywhere', () => {
  const {out, err} = captured(() => {
    SILENT.report({level: 'error', message: 'not a word', details: ['nor this']});
  });
  assert.deepEqual(out, []);
  assert.deepEqual(err, []);
});

test('collected diagnostics keep what they are told, in order', () => {
  const diagnostics = collectDiagnostics();
  diagnostics.report({level: 'error', message: 'first'});
  diagnostics.report({level: 'notice', message: 'second'});

  assert.deepEqual(diagnostics.reported, [
    {level: 'error', message: 'first'},
    {level: 'notice', message: 'second'},
  ]);
});

test('diagnostics go to stderr, never to stdout', () => {
  const {out, err} = captured(() => {
    TO_STDERR.report({level: 'error', message: 'went wrong', details: ['because of this']});
    TO_STDERR.report({level: 'notice', message: 'just so you know'});
  });

  // Findings go to stdout so they can be piped; anything about the run itself
  // goes to stderr, so piping the one does not swallow the other.
  assert.deepEqual(out, []);
  assert.deepEqual(err, ['went wrong', '- because of this', 'just so you know']);
});

// The README promises the library writes nothing to the console. It used to
// be true only because no library entry point happened to call the logger.
test('the library says nothing unless it is given somewhere to say it', async () => {
  const captures: {out: string[]; err: string[]} = {out: [], err: []};
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => captures.out.push(args.map(String).join(' '));
  console.error = (...args: unknown[]) => captures.err.push(args.map(String).join(' '));

  try {
    // Every one of these fails, and would have written to stderr before.
    await run(['--nonsense']);
    await run(['--language', 'not-a-language', 'examples']);
    await runStats(['--format', 'not-a-format']);
    await runStats(['--top', 'seven']);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  assert.deepEqual(captures.err, [], 'nothing should have reached stderr');
});

test('the same failures do report when given somewhere to report to', async () => {
  const diagnostics = collectDiagnostics();
  const code = await run(['--nonsense'], diagnostics);

  assert.equal(code, 2);
  assert.equal(diagnostics.reported[0]?.level, 'error');
  assert.ok(
    diagnostics.reported.some((entry) => entry.message.includes('Usage: gurkencheck')),
    'the usage text should be offered as well',
  );
});

test('a bad configuration reports its details under the message', async () => {
  const diagnostics = collectDiagnostics();
  const code = await run(['--config', 'test/config-parser/bad-config.gurkencheckrc'], diagnostics);

  assert.equal(code, 2);
  const reported = diagnostics.reported[0];
  assert.equal(reported?.level, 'error');
  assert.ok((reported?.details?.length ?? 0) > 0, 'the details should say what is wrong');
});
