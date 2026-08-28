# gurkencheck

[![CI](https://github.com/sebs/gurkencheck/actions/workflows/ci.yml/badge.svg)](https://github.com/sebs/gurkencheck/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/gurkencheck.svg)](https://www.npmjs.com/package/gurkencheck)

A linter for Gherkin feature files. It reads your `.feature` files and tells you where
they drift from the conventions your team has agreed on.

**[Documentation](https://sebs.github.io/gurkencheck/)** — every rule has its own
page with an example that passes and one that fails.

## Install

```sh
npm install --save-dev gurkencheck
```

Requires Node.js 22 or newer.

## Get started

Just run it:

```sh
npx gurkencheck
```

With no configuration file, gurkencheck uses its **recommended** rules: the ones that catch
a mistake rather than express a preference — an empty file, a scenario with no name, a
variable that will never be substituted. Nothing in that set depends on how you lay a file
out, so it should be quiet on a codebase that has never been linted.

When you want something different, create a `.gurkencheckrc` and list the rules you want. A
configuration file replaces the recommended set rather than adding to it, so every rule is
off until you switch it on:

```jsonc
{
  "no-unnamed-features": "on",
  "no-unnamed-scenarios": "on",
  "no-trailing-spaces": "on",
  "indentation": ["on", {"Feature": 0, "Scenario": 2, "Step": 4}]
}
```

With no paths given it searches the current directory for `.feature` files.

| Exit code | Meaning |
|---|---|
| `0` | Nothing worse than a warning |
| `1` | At least one rule set to `"on"` was broken |
| `2` | The linter could not run: bad arguments, or an invalid config |

Findings go to **stdout**, so `gurkencheck > report.json` and `gurkencheck | less` work.
Anything that stops the linter running — a bad option, an invalid config — goes to stderr.

A rule is set to `"on"`, `"warn"` or `"off"`. `"warn"` reports exactly the same findings but
does not fail the run — for a rule the team is working towards rather than enforcing:

```json
{"no-unnamed-scenarios": "on", "use-and": "warn"}
```

## Command line

```
gurkencheck [options] <feature-files>

  -f, --format <format>   output format: stylish, json, junit, sarif, tap,
                          or the path to a formatter of your own
                          (default: stylish)
  -c, --config <path>     configuration file (default: .gurkencheckrc)
  -i, --ignore <globs>    comma separated globs to skip, overriding .gurkencheckignore
  -r, --rulesdir <dir>    directory of custom rules; may be given more than once
  -l, --language <code>   dialect for files with no "# language:" header
  -h, --help              show this message
  -v, --version           show the version number

Commands:
  stats [paths]           report on the shape of your feature files,
                          rather than on what is wrong with them
```

## Rules

There are 36 rules you switch on, covering naming, tags, indentation, structure and size,
plus five that are always on because Gherkin itself refuses to read a file that breaks
them. Each one is documented at
**[sebs.github.io/gurkencheck](https://sebs.github.io/gurkencheck/)** with a
good and a bad example.

The configuration file is JSON and may contain comments. A rule is either a state:

```json
{"no-empty-file": "on"}
```

or a state plus that rule's own settings:

```json
{"name-length": ["on", {"Feature": 70, "Scenario": 70, "Step": 70}]}
```

Mistyped rule names and settings are reported before any file is read.

## Statistics

`gurkencheck stats` describes a suite instead of judging it: what is in the files, how
much of the step vocabulary is shared, and where it has drifted apart.

```sh
npx gurkencheck stats features
```

```
124 files, 124 features, 811 test cases

Inventory
  Features            124
  Rules                18
  Backgrounds          61
  Scenarios           402
  Scenario Outlines    57
  Examples tables      61   409 rows
  Steps              2314   as written
  ...

Scenarios
  Test cases            811   one per Scenario, one per Examples row
  Steps per scenario    min 1   median 5   p90 11   max 27   mean 5.5

  Longest
    27  Checkout with every payment method  features/checkout.feature:88
    ...

Steps
  Written          2314   Background steps included
  Distinct          871   38% of all steps - lower is more reuse
  Written once      512   59% of distinct steps
  ...

  Nearly the same (14 groups)
    9  i am logged in   features/login.feature:4
    2  i'm logged in    features/profile.feature:9
```

It always exits `0`. Statistics are for reading, not for failing a build — that is what
the rules are for.

```
gurkencheck stats [options] <feature-files>

  -f, --format <format>   output format: text, json, md (default: text)
  -i, --ignore <globs>    comma separated globs to skip
  -l, --language <code>   dialect for files with no "# language:" header
      --top <n>           how many entries each list shows (default: 10)
  -h, --help              show this message
```

### What the numbers mean

**Test cases** counts one per Scenario and one per row of every Examples table, because a
Scenario Outline with twelve rows is twelve tests. It is usually well above the number
people carry in their heads, and it is the one that predicts how long a run takes.

**Distinct steps** is the number to watch. Two steps count as one when they differ only in
what a step definition would capture anyway, so these are all the same step:

```gherkin
Given I have 3 items in my cart
Given I have 17 items in my cart
Given I have 3 items in my cart.
```

Numbers, `"quoted strings"` and `<placeholders>` are each replaced by a marker; case,
spacing and a trailing full stop are ignored; and the keyword is left out, so a `Given`
and an `And` of the same text are one step. Single quotes are left alone — `the user's
cart is 'empty'` has three of them, and pairing them up would eat half the sentence.

A low share of distinct steps means the team shares a vocabulary. A high one means
everybody invents their own phrasing, and the step definitions rot.

**Nearly the same** groups steps that are within three single-character edits of each
other: `I am logged in` against `I'm logged in`, or a `<placeholder>` against a value
written in its place. Those are one behaviour costing two step definitions. Three edits
is deliberately tight — beyond that a step is a different sentence rather than the same
one spelled two ways.

**Written once** lists the steps used exactly once. Some are genuine; most are a phrasing
somebody invented because they could not find the one that already existed.

**Untagged scenarios** counts the scenarios carrying no tag of their own and inheriting
none from their Feature or Rule, and so reachable by no tag expression.

Files the parser refuses are listed at the end rather than counted, because half a broken
file would quietly make every number wrong.

### Keeping a record

`--format json` writes the whole dataset, with none of the lists cut short, indented so
that two runs can be diffed:

```sh
npx gurkencheck stats features --format json > stats.json
```

`--format md` writes the same report as Markdown tables, for pasting into a pull request.

## Reporting to GitHub code scanning

`--format sarif` writes a SARIF 2.1.0 log, which GitHub reads directly:

```yaml
- run: npx gurkencheck --format sarif > gurkencheck.sarif
  continue-on-error: true

- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: gurkencheck.sarif
```

Paths in the log are relative to the directory gurkencheck ran in, which is what code
scanning needs to match a finding to a file in the repository.

## Switching a rule off for one place

Write a comment in the feature file:

```gherkin
# gurkencheck-disable-next-line name-length
  Scenario: A name that is long for a good reason and stays that way

# gurkencheck-disable use-and, name-length
  ... everything below here skips those two rules ...
# gurkencheck-enable use-and

# gurkencheck-disable-file no-trailing-spaces
```

| Directive | What it covers |
|---|---|
| `gurkencheck-disable-next-line` | The line directly below the comment |
| `gurkencheck-disable` | From the comment to the end of the file, or to the next `gurkencheck-enable` |
| `gurkencheck-enable` | Resumes the rules a `gurkencheck-disable` switched off |
| `gurkencheck-disable-file` | The whole file, wherever the comment appears |

Name the rules you mean, separated by commas or spaces; a directive naming no rules covers
all of them. Comments inside a doc string are text and are left alone. The five always-on
rules cannot be switched off this way — a file that breaks one of them cannot be read at
all, so hiding the message would leave nothing in its place.

## Feature files in another language

Gherkin is translated into dozens of languages. A file says which one it is written in with
a header on its first line:

```gherkin
# language: fr
Fonctionnalité: Se déconnecter

  Scénario: Se déconnecter
    Quand Ulrick se déconnecte
```

If every file in your project is written in the same language, set it once instead — with
`--language fr` or a `language` key in your configuration file. A header in a file always
wins over that setting, so a project can be mostly one language with exceptions.

## Sharing a configuration

Build on top of another configuration with `extends`. What your file says wins over what it
extends, and later entries in a list win over earlier ones.

```jsonc
{
  "extends": "gurkencheck:recommended",
  "indentation": ["on", {"Step": 4}],
  "no-trailing-spaces": "off"
}
```

| Entry | What it means |
|---|---|
| `gurkencheck:recommended` | The built-in recommended rules |
| `./team/.gurkencheckrc` | Another file, resolved from the file doing the extending |
| `@acme/gurkencheck-config` | An installed package exporting a configuration, as JSON or as a module |

## Skipping files

Put one glob per line in a `.gurkencheckignore` file, or pass `--ignore` on the command
line. Without either, `node_modules` is skipped and everything else is checked.

A pattern that matches a directory skips everything below it, as in `.gitignore` and
`.eslintignore`, so `build` is enough and you do not have to write `build/**`. Blank lines
and lines starting with `#` are ignored.

## Custom formatters

Pass a path or a package name to `--format`. The module exports a function taking the
results; it may print the output itself, or return a string and let gurkencheck print it.

```js
// count.mjs
export default function count(results) {
  const findings = results.reduce((total, file) => total + file.errors.length, 0);
  return `${findings} findings in ${results.length} files`;
}
```

```sh
npx gurkencheck --format ./count.mjs
```

Each result is `{filePath, errors}`, and each error is
`{message, rule, line, column, severity}`. A default export, a `printResults` export, or a
module that is itself the function all work.

## Custom rules

Point `--rulesdir` at a directory of your own modules. Each exports an object with a
`name` and a `run` function, and is called once per file. CommonJS, ES modules and
TypeScript all work.

```js
// rules/no-lorem.js
const name = 'no-lorem';

export default {
  name,
  run(feature, file) {
    if (feature === undefined) return [];
    return feature.children
      .filter((child) => child.scenario?.name.includes('lorem'))
      .map((child) => ({
        message: 'Placeholder text left in a scenario name',
        rule: name,
        line: child.scenario.location.line,
      }));
  },
};
```

```sh
npx gurkencheck --rulesdir ./rules
```

A custom rule may reuse a built-in rule's name to replace it.

`run` may also be `async` and return a promise, for a rule that has to wait for
something — reading a file, or asking an issue tracker whether a tag refers to a real
ticket. Files are checked one after another, so rules see a predictable order.

## Using it as a library

```ts
import {findFeatureFiles, lint, loadRules, readConfiguration} from 'gurkencheck';

const rules = await loadRules();
const config = readConfiguration('.gurkencheckrc', rules);

if (config.ok) {
  const {files} = findFeatureFiles(['features']);
  const results = await lint(files, config.configuration, rules);
}
```

Each error carries `message`, `rule`, `line` and, where the rule knows one, `column` —
both 1-based, so an editor can underline exactly the right text. Errors about a whole file
or a whole line, such as a missing new line at the end of the file, have no `column`.

Nothing in the library writes to the console or exits the process; that is the command
line's job.

## Developing

The project is TypeScript with two runtime dependencies:
[`@cucumber/gherkin`](https://github.com/cucumber/gherkin) and its own `@cucumber/messages`.
Everything else — argument parsing, globbing, JSON-with-comments, XML output, the
collection helpers — is plain TypeScript in `src/util`. Tests run on node's built-in test
runner, straight off the sources using node's type stripping, so there is no build step
to run before testing.

```sh
npm test              # node --test over test/**/*.test.ts
npm run coverage      # the same, with node's coverage reporter
npm run typecheck     # tsc over src, test, site and scripts
npm run build         # compile src into dist
npm run docs          # regenerate the documentation site into docs/
npm run demo          # lint the deliberately broken files in examples/
```

### Releasing

Versions are bumped and tagged locally; everything after that is a workflow.

```sh
npm version patch        # bumps package.json, commits, and tags v0.0.4
git push --follow-tags
```

Pushing the tag runs two workflows:

| Workflow | Trigger | What it does |
|---|---|---|
| **Release** | the tag | Checks the tag matches `package.json`, runs the tests, builds, and creates the GitHub release with the npm tarball attached |
| **Pages** | the tag | Builds the documentation site from that version and deploys it |

Publishing to npm is deliberately a separate step, so a release can be looked at before it
goes out. Run the **Publish** workflow by hand and give it the version — it checks out that
tag, re-runs the tests, and publishes with provenance. There is no `NPM_TOKEN` in the
repository: npm Trusted Publishing mints a short-lived credential for the run.

The site is not committed. `docs/` is generated during the Pages run, so the published site
always matches the version it was built from. Run the Pages workflow by hand with a version
to re-publish or to roll the site back; leave the version empty to publish from the branch
you run it on, which is useful for previewing a docs change.

### Adding a rule

1. Add `src/rules/<name>.ts`, exporting a default object with `name` and `run`.
2. Run `npm run generate:rules` to add it to the registry.
3. Add `test/rules/<name>/<name>.test.ts` and its fixtures.
4. Add an entry to `site/content.ts` and run `npm run docs`.

Steps 2 and 4 are enforced by tests, so a rule cannot ship undocumented or unregistered.

## History

gurkencheck is a fork of [gherkin-lint](https://github.com/gherkin-lint/gherkin-lint),
rewritten in TypeScript. See [MIGRATING.md](MIGRATING.md) if you are coming from it.

## Licence

ISC. See [LICENSE](LICENSE).
