import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseArgs} from 'node:util';
import {describeArgumentError} from '../../src/util/args.ts';

function errorFor(args: string[]): unknown {
  try {
    parseArgs({args, options: {config: {type: 'string', short: 'c'}}, allowPositionals: true});
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
