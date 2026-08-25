import assert from 'node:assert/strict';
import path from 'node:path';
import {test} from 'node:test';
import {readConfiguration} from '../src/config-parser.ts';
import {lint} from '../src/linter.ts';
import {loadRules} from '../src/rules.ts';

const RULES_DIRS = [
  path.resolve('test/rulesdir/rules'), // absolute path
  path.join('test', 'rulesdir', 'other_rules'), // relative to the working directory
];

test('loads custom rules written as CommonJS, ESM and .mjs', async () => {
  const rules = await loadRules(RULES_DIRS);
  const config = readConfiguration('test/rulesdir/.gurkencheckrc', rules);
  assert.ok(config.ok, 'the fixture configuration should be valid');

  const featureFile = 'test/rulesdir/simple.features';
  const results = await lint([featureFile], config.configuration, rules);

  assert.deepEqual(results, [
    {
      filePath: path.resolve(featureFile),
      errors: [
        {
          // Proves the built-in rules are still loaded alongside the custom ones.
          line: 1,
          message: 'Wrong indentation for "Feature", expected indentation level of 0, but got 4',
          rule: 'indentation',
        },
        {line: 109, message: 'Another custom-list error', rule: 'another-custom-list'},
        {line: 123, message: 'Custom error', rule: 'custom'},
        {line: 456, message: 'Another custom error', rule: 'another-custom'},
      ],
    },
  ]);
});

test('keeps the built-in rules alongside the custom ones', async () => {
  const rules = await loadRules(RULES_DIRS);
  assert.equal(rules.get('custom')?.name, 'custom');
  assert.ok(rules.has('indentation'));
});

test('rejects a directory holding a module that is not a rule', async () => {
  await assert.rejects(() => loadRules(['test/rulesdir/not-rules']), /does not export a rule/u);
});
