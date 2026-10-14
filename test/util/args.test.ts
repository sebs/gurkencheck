import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseArgs} from 'node:util';
import {describeArgumentError} from '../../src/util/args.ts';

function errorFor(args: string[]): unknown {
  try {
    parseArgs({
      args,
      options: {config: {type: 'string', short: 'c'}, help: {type: 'boolean', short: 'h'}},
      allowPositionals: true,
    });
  } catch (thrown) {
    return thrown;
  }
  assert.fail('expected parseArgs to throw');
}

test('an unknown option is named, with every quote closed', () => {
  assert.equal(
    describeArgumentError(errorFor(['--bogus'])),
    'Unknown option "--bogus". To name a file starting with -, put it after --, as in -- --bogus',
  );
});

test('a missing value is named as the help names it', () => {
  const usage = '  -c, --config <path>     configuration file';
  assert.equal(describeArgumentError(errorFor(['-c']), usage), '-c, --config needs a value: -c, --config <path>');
  assert.equal(describeArgumentError(errorFor(['--config'])), '-c, --config needs a value: -c, --config <value>');
});

test('a value starting with a dash, and a value for a switch, each get one line', () => {
  const usage = '  -c, --config <path>     configuration file';
  const dashed = describeArgumentError(errorFor(['-c', '-x.json']), usage);
  assert.equal(dashed, '-c was given a value starting with -. Write it as --config=<value> to pass one, or give -c a value.');
  assert.equal(describeArgumentError(errorFor(['--help=yes'])), '--help takes no value.');
});
