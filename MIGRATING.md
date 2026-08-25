# Migrating from gherkin-lint

gurkencheck is `gherkin-lint` rewritten in TypeScript. The rules and their messages are
almost all unchanged; what moved is the packaging and a handful of long-standing bugs.

## You have to change

**The package and command are renamed.**

```diff
-npm install --save-dev gherkin-lint
-npx gherkin-lint
+npm install --save-dev gurkencheck
+npx gurkencheck
```

**The configuration and ignore files are renamed.** The old names are not read.

```diff
-.gherkin-lintrc
-.gherkin-lintignore
+.gurkencheckrc
+.gurkencheckignore
```

The contents do not change. JSON with comments still works.

**Node.js 22 or newer is required**, and the package is ES modules only. If you
`require()` it, switch to `import`.

## You might notice

**Two messages had their spelling corrected.** If you match on message text:

```diff
-Tags on Backgrounds are dissallowed
+Tags on Backgrounds are disallowed

-... Multiline steps are dissallowed
+... Multiline steps are disallowed
```

The message for `no-multiline-steps` now names the step keywords of the file's own
language, so a German feature file reads `"Angenommen", "Wenn", "Dann", "Und" or "Aber"`.

**A new exit code.** `1` still means a rule was broken. Problems that stop the linter
running at all — an unknown option, a missing config file, a mistyped rule name — now
exit `2` instead of `1`.

**The `json` format now matches eslint's.** The `errors` array is `messages`, `rule` is
`ruleId`, severity is eslint's number (2 error, 1 warning), and each file carries
`errorCount` and `warningCount`. Anything already built around eslint's JSON — report
viewers, annotation actions, dashboards — now reads gurkencheck output without a converter.

```diff
-[{"filePath": "a.feature", "errors": [{"message": "...", "rule": "use-and", "line": 3}]}]
+[{"filePath": "a.feature",
+  "messages": [{"ruleId": "use-and", "severity": 2, "message": "...", "line": 3}],
+  "errorCount": 1, "warningCount": 0}]
```

The library's `lint()` still returns the readable `{filePath, errors}` shape; only the
`json` formatter changed. `toJson()` is exported if you want the eslint shape from code.

**The xunit report is now a real JUnit report, under the name `junit`.** The old output
had no `<testsuites>` root and no `tests`/`failures` counts, which many CI parsers require,
and put every finding for a file inside one `<testcase>`. Each finding is now its own test
case inside a suite per file, so a build shows one failing test per problem:

```xml
<testsuites name="gurkencheck" tests="2" failures="1" errors="0">
  <testsuite name="features/Login.feature" tests="1" failures="1" errors="0" skipped="0">
    <testcase name="no-unnamed-scenarios (3:5)" classname="features.Login">
      <failure message="Missing Scenario name" type="no-unnamed-scenarios">…</failure>
    </testcase>
  </testsuite>
</testsuites>
```

`--format xunit` still works and gives you the same JUnit report.

**Results come back in the order you asked for them.** Files were previously processed
concurrently and collected as they finished, which made the output order — and the file
named by `no-dupe-feature-names` — vary between runs.

**Reported paths no longer resolve symlinks.** `filePath` is now the absolute path,
without following links.

## Fixed

**Features using `Rule:` no longer crash the linter.** `max-scenarios-per-file`,
`scenario-size` and `no-restricted-patterns` threw on any file containing a `Rule:`.
Alongside that fix, the rules that only ever looked at top-level children now also look
inside Rules: `use-and`, `name-length`, `scenario-size`, `max-scenarios-per-file`,
`no-restricted-patterns`, `no-unused-variables`, `no-dupe-scenario-names`,
`no-examples-in-scenarios` and `no-scenario-outlines-without-examples`. If you use
`Rule:`, expect these to report more than before. `no-restricted-patterns` also gained a
`Rule` key for patterns that apply only inside a Rule.

**Features named after a JavaScript built-in are no longer falsely flagged.**
`no-dupe-feature-names` and `no-dupe-scenario-names` kept their records in an array and
tested membership with `in`, so a feature called `length` or `constructor` was reported
as a duplicate of nothing.

**Rules no longer write into their own defaults.** `name-length` and `file-name` merged
your settings into the shared defaults object, so the first file's configuration leaked
into every later file in the same run.

**`new-line-at-eof` no longer kills the process.** Switched on without a value it used to
print an error and call `process.exit(1)`. It now defaults to `"yes"`.

**`scenario-size` fills in the limits you leave out.** Previously, setting only
`Scenario` left `Background` unchecked. Omitted limits now fall back to 15, matching how
every other rule treats its defaults. The `Rule` key has been dropped, as a `Rule:` holds
no steps of its own.

**`no-partially-commented-tag-lines` reads the source line.** The newer Gherkin parser
correctly treats `@tag #comment` as a comment, which removed the evidence the rule used
to rely on. It now checks the original line, so `@tag # @other` is caught again.

**A tag on a Background no longer hides the rest of the file.** The parser stops at the
tag; gurkencheck removes it and parses again, so problems further down the file are still
reported.

## New rules

**`background-before-scenarios`** is a new always-on rule. A Background written below the
Scenarios it applies to used to be reported as
`up-to-one-background-per-file` — "Multiple \"Background\" definitions in the same file are
disallowed" — even when the file had only one. The parser rejects both the same way, so
the two are now told apart by looking at what came before, and a misplaced Background
gets its own message. If you match on rule names, this is a name you have not seen before.


**`no-undeclared-variables`** is the second half of `no-unused-variables`, split out.
`no-unused-variables` reported both an Examples column no step reads and a
`<placeholder>` with no column behind it, which are two different mistakes with two
different fixes. It now reports only the first. If you relied on the second, switch the
new rule on as well:

```diff
 {
-  "no-unused-variables": "on"
+  "no-unused-variables": "on",
+  "no-undeclared-variables": "on"
 }
```

The message text is unchanged; only the `rule` name attached to it differs.

## Findings now go to stdout

Results were written to stderr, which made `gherkin-lint > report.json` produce an empty
file and mixed findings in with anything else on that stream. They now go to stdout;
messages about the linter itself not being able to run stay on stderr.

```diff
-gherkin-lint --format json 2> report.json
+gurkencheck --format json > report.json
```

## New in the configuration file

**A rule may be set to `"warn"`** as well as `"on"` and `"off"`. It reports the same
findings but does not fail the run. The stylish output now always carries a severity
column, so if you match on its shape, that is one more field:

```diff
-  3:3    Missing Scenario name    no-unnamed-scenarios
+  3:3    error      Missing Scenario name    no-unnamed-scenarios
```

In the xunit report a warning's `type` is `gurkencheck-warning` rather than
`gurkencheck-error`.

## New checks in existing rules

**`indentation` now checks doc strings.** The line opening a doc string (""" or ```) is checked against a new `docstring` setting, which defaults to the
`Step` indentation plus two, the conventional layout. If your files indent doc strings
level with their step, either move them in or set `docstring` to match `Step`:

```json
{"indentation": ["on", {"Step": 4, "docstring": 4}]}
```

## If you use it as a library

The API is now explicit about loading rules, and nothing writes to the console or exits
the process.

```diff
-const linter = require('gherkin-lint/dist/linter.js');
-const configParser = require('gherkin-lint/dist/config-parser.js');
-const featureFinder = require('gherkin-lint/dist/feature-finder.js');
-
-const files = featureFinder.getFeatureFiles(args, ignore);
-const config = configParser.getConfiguration(configPath, rulesDirs);
-const results = await linter.lint(files, config, rulesDirs);
+import {findFeatureFiles, lint, loadRules, readConfiguration} from 'gurkencheck';
+
+const rules = await loadRules(rulesDirs);
+const config = readConfiguration(configPath, rules);
+if (!config.ok) throw new Error([config.message, ...config.details].join('\n'));
+
+const {files, invalidPatterns} = findFeatureFiles(args, ignore);
+const results = await lint(files, config.configuration, rules);
```

`readConfiguration` is now `async`, because `extends` may pull a configuration out of an
installed package. It returns `{ok: true, configuration, source}` or `{ok: false, message, details}`
instead of printing and exiting. `findFeatureFiles` returns the patterns it could not make
sense of instead of exiting. Rules are loaded once into a registry and passed in, rather
than being re-read from disk for every file.

## If you have custom rules

A rule module is still an object with `name`, `run` and optionally `availableConfigs`, and
`run` still takes `(feature, file, configuration)`. Two things to know:

- Rules are loaded with `import()`, so a `.js` file in a package with
  `"type": "module"` must use `export default`. Rename it to `.cjs` to keep
  `module.exports`. `.mjs` and `.ts` are also accepted.
- `feature` is `undefined` rather than falsy-but-present when a file could not be parsed
  into a feature. `if (!feature) return [];` still works.

Rules that need to remember things between files — the way the duplicate-name rules do —
should expose a `reset()` method. gurkencheck calls it once at the start of each run, so
state no longer leaks between runs in a long-lived process.
