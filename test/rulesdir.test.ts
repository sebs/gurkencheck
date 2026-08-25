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
  const config = await readConfiguration('test/rulesdir/.gurkencheckrc', rules);
  assert.ok(config.ok, 'the fixture configuration should be valid');

  const featureFile = 'test/rulesdir/simple.features';
  const results = await lint([featureFile], config.configuration, rules);

  assert.deepEqual(results, [
    {
      filePath: path.resolve(featureFile),
      errors: [
        {
          // Proves the built-in rules are still loaded alongside the custom ones.
          severity: 'error',
          line: 1,
          column: 5,
          message: 'Wrong indentation for "Feature", expected indentation level of 0, but got 4',
          rule: 'indentation',
        },
        {severity: 'error', line: 109, message: 'Another custom-list error', rule: 'another-custom-list'},
        {severity: 'error', line: 123, message: 'Custom error', rule: 'custom'},
        {severity: 'error', line: 456, message: 'Another custom error', rule: 'another-custom'},
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

// https://github.com/gherkin-lint/gherkin-lint/issues/342
test('a custom rule may return a promise', async () => {
  const rules = await loadRules(['test/rulesdir/async_rules']);
  const featureFile = 'test/linter/NoViolations.feature';
  const results = await lint([featureFile], {'slow-custom': 'on'}, rules);

  assert.deepEqual(results[0]?.errors, [
    {
      severity: 'error',
      line: 6,
      message: 'Checked "This is a Scenario" after waiting',
      rule: 'slow-custom',
    },
  ]);
});

test('an async rule that rejects surfaces the error rather than being swallowed', async () => {
  const rules = new Map([
    [
      'exploding',
      {
        name: 'exploding',
        run: async () => {
          throw new Error('the issue tracker is down');
        },
      },
    ],
  ]);
  await assert.rejects(
    () => lint(['test/linter/NoViolations.feature'], {exploding: 'on'}, rules),
    /the issue tracker is down/u,
  );
});
