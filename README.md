# gurkencheck

[![Test](https://github.com/gurkencheck/gurkencheck/actions/workflows/test.yml/badge.svg)](https://github.com/gurkencheck/gurkencheck/actions/workflows/test.yml)
[![npm](https://img.shields.io/npm/v/gurkencheck.svg)](https://www.npmjs.com/package/gurkencheck)

A linter for Gherkin feature files. It reads your `.feature` files and tells you where
they drift from the conventions your team has agreed on.

**[Documentation](https://gurkencheck.github.io/gurkencheck/)** — every rule has its own
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

  -f, --format <format>   output format: stylish, json, xunit (default: stylish)
  -c, --config <path>     configuration file (default: .gurkencheckrc)
  -i, --ignore <globs>    comma separated globs to skip, overriding .gurkencheckignore
  -r, --rulesdir <dir>    directory of custom rules; may be given more than once
  -h, --help              show this message
  -v, --version           show the version number
```

## Rules

There are 33 rules you switch on, covering naming, tags, indentation, structure and size,
plus four that are always on because Gherkin itself refuses to read a file that breaks
them. Each one is documented at
**[gurkencheck.github.io/gurkencheck](https://gurkencheck.github.io/gurkencheck/)** with a
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
all of them. Comments inside a doc string are text and are left alone. The four always-on
rules cannot be switched off this way — a file that breaks one of them cannot be read at
all, so hiding the message would leave nothing in its place.

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
