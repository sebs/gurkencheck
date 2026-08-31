# Where event-driven APIs would make gurkencheck better

A review of the gurkencheck implementation (v0.0.7) looking for places where the current
batch/collect-then-return design fights the problem, and an event-driven shape would fit it
better.

The short version: the codebase is clean, well-commented and mostly does the right thing with
plain functions. Most of it should stay that way. But there is one **phase boundary** —
discover → read → parse → check → format — that is currently built as four sequential batch
steps, and every problem below falls out of that. One of them is a demonstrable crash.

Findings are ordered by what they actually cost you today, not by how interesting the
refactor is.

---

## 1. The read phase has no error isolation, and loses the whole run — ~~*demonstrated bug*~~ **FIXED**

**Where:** [`src/linter.ts:33-35`](src/linter.ts#L33-L35)

```ts
const parsed = await Promise.all(
  files.map((file) => readAndParseFile(file, options.language)),
);
```

`readAndParseFile` calls `readFile` ([`src/gherkin/parse.ts:307`](src/gherkin/parse.ts#L307)),
which rejects on any I/O failure. There is no `catch` here, none in
[`run()`](src/main.ts#L128), and `Promise.all` rejects on the first failure. A single
unreadable file therefore takes down the entire run and discards the findings for every other
file.

### Reproduced

A directory with two valid feature files, one of them `chmod 000`:

```
Error: EACCES: permission denied, open 'features/unreadable.feature'
    at async readAndParseFile (src/gherkin/parse.ts:307:18)
    at async Promise.all (index 1)
    at async lint (src/linter.ts:33:18)
    at async run (src/main.ts:128:19)
```

Node exits **1**. `EXIT_LINT_ERRORS` is also **1**
([`src/exit-codes.ts`](src/exit-codes.ts)) — so a CI job cannot tell a crash from "the linter
found problems". It reports a stack trace as if it were lint findings.

This is not exotic. It fires on a permissions problem, a dangling symlink, a file deleted
between globbing and reading, or a network mount hiccup.

**The stats command already gets this right** and shows what the fix looks like:
[`src/stats/command.ts:46-62`](src/stats/command.ts#L46-L62) wraps each read in a `try/catch`
and turns a failure into a `ParseResult` carrying the error. Against the same fixture, stats
prints `1 of 2 files` and exits 0.

### Why event-driven is the fix rather than just adding a try/catch

A `try/catch` around each read would fix the crash — and it should be done immediately,
regardless of anything else in this document. But the underlying shape is the problem:
`Promise.all` over the whole file list means **one failure mode is shared by every file**.
Per-file emission makes failure per-file by construction. You cannot reintroduce this bug in a
pipeline that hands you one result at a time.

**Recommendation:** fix the crash now with a `try/catch` mirroring `stats`. Then fold it into
the pipeline in finding #3, where per-file isolation is structural rather than remembered.

### Status: fixed

`readAndParseFile` now never throws — a file it cannot read comes back as a `ParseResult`
carrying an `unexpected-error`, exactly as a file the parser rejected does. `stats`' private
`read()` wrapper was deleted in favour of it, so both commands now share one implementation
rather than one pattern.

An audit for the same defect elsewhere found five more instances, all fixed on the same
principle — a failing unit produces an in-band error and the run continues:

| Path | Was | Now |
|---|---|---|
| Running a rule ([`rules.ts`](src/rules.ts)) | a throwing rule rejected the whole `lint` call | `unexpected-error` naming the rule; other rules still run |
| Invoking the formatter ([`main.ts`](src/main.ts)) | a custom formatter throwing crashed after all the work | clean message, exit 2 |
| Reading `.gurkencheckignore` ([`feature-finder.ts`](src/feature-finder.ts)) | `existsSync`+`readFileSync` race, EACCES crashed | falls back to the defaults |
| `extends` a package that throws ([`config-parser.ts`](src/config-parser.ts)) | rethrown past the handler, crashed | reported as a configuration error |
| Loading a custom rule ([`rules.ts`](src/rules.ts)) | error without the file path | names the rule file |
| Top level ([`main.ts`](src/main.ts)) | any crash exited 1, same as "found findings" | exits 2, so CI can tell them apart |

Finding #3 still stands: per-file isolation is now *remembered* in six places rather than
structural. A streaming pipeline is what would make it structural.

---

## 2. The same `Promise.all` reads and parses the entire suite into memory before checking anything — **FIXED**

**Where:** [`src/linter.ts:33-35`](src/linter.ts#L33-L35),
[`src/stats/command.ts:125`](src/stats/command.ts#L125)

The comment above `lint` says:

> Files are read concurrently but checked one after another, because rules that look for
> duplicates across files need a predictable order.

The *intent* is right. The implementation has two problems the comment does not mention:

**Unbounded concurrency.** `files.map(readAndParseFile)` issues one `open()` per feature file
simultaneously, with no cap anywhere in the read path. Whether that reaches `EMFILE` depends
entirely on the platform's descriptor limit, and this varies enormously — `ulimit -n` on this
machine is 1048576, so it would never bite here, but constrained CI containers and older macOS
defaults sit in the hundreds. Treat this as a portability risk rather than a certain failure:
the point is that the ceiling is set by the size of the user's suite, not by gurkencheck.

**Peak memory is the whole suite.** Every file's source *and* its parsed AST is materialised
before the first rule runs. The ASTs are the expensive half: `@cucumber/messages` nodes are
verbose, and every step carries a UUID. Nothing is released until `lint` returns, because
`parsed` stays live for the whole loop.

Neither matters at 23 example files. Both matter for the audience the README targets — a real
suite in CI.

### What event-driven buys

A bounded read-ahead window is the classic backpressure problem, and an async generator solves
it with no machinery:

```ts
async function* parseStream(
  files: readonly string[],
  language: string | undefined,
  readAhead = 8,
): AsyncGenerator<ParseResult> {
  const window: Promise<ParseResult>[] = [];
  let next = 0;
  const fill = () => {
    while (window.length < readAhead && next < files.length) {
      window.push(readOrReportFailure(files[next++]!, language));
    }
  };
  fill();
  while (window.length > 0) {
    yield await window.shift()!;   // order preserved: FIFO
    fill();
  }
}
```

Memory becomes O(readAhead) instead of O(suite). File descriptors are capped. **The ordering
guarantee the comment cares about is preserved** — the window is FIFO, so results still arrive
in the order `files` gave them, which is what the cross-file duplicate rules need.

The same generator serves `stats`, which today duplicates the unbounded-`Promise.all` mistake
at [`src/stats/command.ts:125`](src/stats/command.ts#L125). One fix, two call sites.

---

## 3. `lint()` is all-or-nothing: nothing is observable until every file is done — **FIXED**

**Where:** [`src/linter.ts:25-58`](src/linter.ts#L25-L58)

```ts
export async function lint(...): Promise<FileResult[]>
```

Every result is accumulated into `results` and handed back in one blob. Consequences:

- **No progress.** A slow run is indistinguishable from a hung one. There is nothing to hang a
  spinner, a counter or a progress bar on.
- **No streaming output.** See finding #5 — TAP in particular is actively harmed by this.
- **No early exit.** A `--max-warnings` or "stop at the first error" flag cannot be
  implemented without running everything first and throwing the work away.
- **No editor integration worth having.** An LSP server or a VS Code extension wants results
  for the file the user is looking at, now — not after the whole workspace is linted. Today it
  must either lint one file at a time (losing every cross-file rule) or lint everything and
  wait.
- **No watch mode.** See finding #7.

The README explicitly sells library use ("[Using it as a library](README.md)"), so this is a
public-API limitation, not just a CLI one.

### Recommendation: an async generator, with `lint()` kept as a thin collector

```ts
/** Yields one result per file, as soon as that file is done. */
export async function* lintStream(
  files: readonly string[],
  configuration: Configuration,
  rules: RuleRegistry,
  options: LintOptions = {},
): AsyncGenerator<FileResult> { /* ... */ }

/** Unchanged public behaviour: collects the stream. */
export async function lint(...args): Promise<FileResult[]> {
  const results: FileResult[] = [];
  for await (const result of lintStream(...args)) results.push(result);
  return results;
}
```

This is **fully backward compatible** — `lint` keeps its exact signature and semantics — and it
is roughly a dozen lines, because `lint`'s body is already a `for` loop that pushes one
`FileResult` per iteration. The loop body becomes a `yield`.

Consumers who want incremental behaviour get it; consumers who want the array keep it. Early
termination comes free: breaking out of a `for await` calls the generator's `return()`, which
stops the reads.

---

## 4. Cross-file rule state lives in module-scope singletons, and `reset()` is a lifecycle event in disguise — **FIXED**

**Where:** [`src/rules/no-dupe-feature-names.ts:7`](src/rules/no-dupe-feature-names.ts#L7),
[`src/rules/no-dupe-file-names.ts:13`](src/rules/no-dupe-file-names.ts#L13),
[`src/rules/no-dupe-scenario-names.ts:16`](src/rules/no-dupe-scenario-names.ts#L16),
[`src/rules.ts:103-107`](src/rules.ts#L103-L107)

Three rules keep a `const seen = new Map(...)` at **module scope** and implement `reset()`,
which `lint()` calls once per run via `resetRules`. This is the only stateful part of the rule
system, and it has real problems:

### 4a. Two concurrent runs in one process corrupt each other

Module scope is process-global. `resetRules(rules)` at
[`src/linter.ts:31`](src/linter.ts#L31) clears state that *another in-flight `lint()` call is
currently using*. An LSP server linting two workspace folders, a test suite running lint cases
in parallel, or a build tool checking two packages concurrently will produce wrong output —
missed duplicates, or duplicates attributed to the wrong file. There is nothing in the type
system or the docs preventing this; `lint` looks like a pure async function.

### 4b. A rule reaches into shared state mid-run

[`src/rules/no-dupe-scenario-names.ts:28-30`](src/rules/no-dupe-scenario-names.ts#L28-L30):

```ts
if (configuration === 'in-feature') {
  seen.clear();
}
```

A rule clearing a global map from inside `run()` to emulate per-file scoping. This works, but
it means the rule's behaviour depends on configuration *and* on nobody else touching the map.

### 4c. Findings are attributed to whichever file happened to be second

Both `no-dupe-feature-names` and `no-dupe-file-names` report on the *later* file and name the
earlier one in the message. Reverse the file order and the error moves to a different file.
For a genuinely symmetric relationship ("these two files share a name") that is an arbitrary
choice, and it makes the output order-dependent in a way users notice when a glob's ordering
shifts.

### The event-driven fix: run lifecycle events and a per-run context

`reset()` is already an ad-hoc lifecycle hook — it exists precisely because the rule API has no
notion of "a run is starting". Make that explicit:

```ts
export interface LintRule {
  readonly name: string;
  readonly availableConfigs?: unknown;

  /** Called once before any file. Returns state private to this run. */
  onRunStart?(context: RunContext): void;
  run(feature, file, configuration): RuleError[] | Promise<RuleError[]>;
  /** Called once after the last file. Where cross-file findings belong. */
  onRunEnd?(context: RunContext): FileFinding[] | Promise<FileFinding[]>;
}
```

with per-run state carried on the context rather than in the module:

```ts
run(feature, file, configuration, context) {
  const seen = context.state<Map<string, string[]>>(() => new Map());
  // ...
}
```

Three wins, in order of importance:

1. **Concurrent runs stop interfering.** State is scoped to a run, so two runs cannot see each
   other. This is the correctness fix.
2. **Cross-file findings are emitted where they belong** — at `onRunEnd`, reporting *every*
   file involved in a duplicate rather than arbitrarily blaming the second one. `FileFinding`
   needs a `filePath` because a run-end finding is not tied to the file being visited.
3. **`reset()` disappears**, along with the requirement that every caller of `runEnabledRules`
   remember to call `resetRules` first.

This does change the `LintRule` contract, which is public and documented — see
[Compatibility](#compatibility) below. The new members are all optional, so existing custom
rules keep working untouched.

---

## 5. Formatters take the complete array, so nothing can stream — and TAP is advertised as a stream but isn't one — **FIXED**

**Where:** [`src/formatters/index.ts:20-22`](src/formatters/index.ts#L20-L22),
[`src/formatters/tap.ts`](src/formatters/tap.ts)

```ts
export type Formatter = (results: readonly FileResult[]) => void | string | Promise<void | string>;
```

Every formatter receives the whole run. For three of the five that is correct. For two it is
not.

### TAP is a streaming protocol, and this defeats its purpose

[`src/formatters/tap.ts:46`](src/formatters/tap.ts#L46) says "Renders the results as a TAP 13
stream". It does not — it builds an array of lines and joins them at the end. The entire point
of TAP is that a harness sees `ok 1` while test 2 is still running: live progress, and partial
results if the run dies. Buffering the whole thing and printing it at once gives a TAP consumer
none of that.

The obvious objection is the plan line, `1..N` at
[`tap.ts:48`](src/formatters/tap.ts#L48), which needs `N` up front. TAP 13 anticipated exactly
this: **the plan may be trailing**. Emit test points as they arrive and write `1..N` last.

### stylish is already streamable and doesn't know it

[`src/formatters/stylish.ts:65-81`](src/formatters/stylish.ts#L65-L81) loops per file and
computes its column widths *per file*
([`stylish.ts:73-74`](src/formatters/stylish.ts#L73-L74)) — from that file's errors only. So
each block is fully determined by one `FileResult`. It could print each block the moment that
file is done, **with byte-identical output**. No format change, no trade-off; the batching is
incidental.

### json, sarif and junit genuinely need the whole run

They emit a single well-formed document with a root element and, in junit's case, aggregate
counts. Streaming these would mean either hand-rolling incremental JSON/XML serialisation or
changing the output format. Not worth it. **They should keep the batch shape.**

### Recommendation: make the streaming shape additive

```ts
export interface StreamingFormatter {
  onStart?(): string | void;
  onFile(result: FileResult): string | void;
  onEnd(): string | void;
}
export type Formatter = BatchFormatter | StreamingFormatter;
```

`loadFormatter` already sniffs module shapes (default export / `printResults` / the module
itself, [`formatters/index.ts:89-90`](src/formatters/index.ts#L89-L90)), so detecting one more
shape fits the existing design. Formatters that can stream do; the rest are driven by
collecting the stream and calling them once, exactly as today. Custom formatters documented in
the README are unaffected.

---

## 6. Discovery is synchronous, buffers everything, and is already push-shaped internally — **DONE, but the reasoning here was wrong**

**Where:** [`src/util/glob.ts:118-138`](src/util/glob.ts#L118-L138),
[`src/util/glob.ts:177-212`](src/util/glob.ts#L177-L212),
[`src/feature-finder.ts:69-89`](src/feature-finder.ts#L69-L89)

`walk()` is a recursive `readdirSync`. On a large monorepo it **blocks the event loop for the
entire tree scan** before a single byte of output appears, and nothing else can be interleaved
with it. Then everything is collected into an array and sorted
([`glob.ts:211`](src/util/glob.ts#L211)) before the caller sees anything.

The interesting part: **`walk` already takes an `onFile` callback**
([`glob.ts:118`](src/util/glob.ts#L118)). The push shape exists. It is collapsed back into an
array at the boundary ([`glob.ts:193-199`](src/util/glob.ts#L193-L199)) purely because
`globSync` returns `string[]`.

So discovery, reading, parsing and checking run as four strictly sequential phases when they
could be one pipeline. Time-to-first-finding is currently *whole tree scan + whole read + whole
parse*; it could be *one directory + one file*.

### The ordering constraint is satisfiable

`globSync` sorts its results for deterministic output, which looks incompatible with streaming.
It isn't: [`glob.ts:127`](src/util/glob.ts#L127) **already sorts each directory's entries
before recursing**. A depth-first walk over per-directory-sorted entries emits files in sorted
order *as it goes*. The final `.sort()` is belt-and-braces and can be dropped for the streaming
path without changing the order files come out in.

**Recommendation:** add an async `globStream` generator alongside `globSync` (keep the sync
one — config discovery and the rules-directory loader want it, and it is a nice public API).
Add `findFeatureFileStream` next to `findFeatureFiles`. This is the lowest-priority of the
pipeline findings: it only pays off on large trees, and it is the most code.

---

## 7. Watch mode is the thing these findings add up to — **DONE**

There is no watch mode, and the current architecture cannot cheaply grow one. Everything is a
single-shot pipeline terminating in `process.exitCode`
([`src/main.ts:160`](src/main.ts#L160)).

Watch is inherently event-driven — fs events in, re-lint the affected files, re-emit results —
and it needs precisely the four things above:

| Needs | Finding |
|---|---|
| Results as they are produced, not one array at the end | #3 |
| Per-run rule state, so re-linting one file doesn't need a global `resetRules` | #4 |
| Formatters that can emit repeatedly without re-printing everything | #5 |
| Cheap incremental discovery | #6 |

Worth naming explicitly because it reframes the other findings: they are not four unrelated
refactors, they are the four prerequisites for the feature a linter is most often asked for
next. If watch mode is not on the roadmap, findings #3–#6 are worth noticeably less and should
be weighted accordingly. **That is the main question to settle before doing any of this work.**

The hard part of watch mode is not the file watching — it is that cross-file rules
(`no-dupe-*`) need the *whole* picture. Editing one file can create or resolve a duplicate in
another. Finding #4's `onRunEnd` model handles this correctly: keep per-file parse results
cached, re-run only the edited file's per-file rules, then re-run the run-end pass over the
cached set.

---

## 8. `logger` is hard-wired to the console (minor) — **DONE**

**Where:** [`src/logger.ts`](src/logger.ts)

`error` and `boldError` call `console.error` directly. The README promises:

> Nothing in the library writes to the console or exits the process; that is the command
> line's job.

That promise is upheld by convention, not by construction — and it is **already slightly
untrue**: [`src/index.ts:72`](src/index.ts#L72) exports `runStats`, which logs to stderr at
[six call sites](src/stats/command.ts#L79) and returns a process exit code. A library consumer
importing `runStats` gets console output.

A diagnostic event — the linter emits, the CLI subscribes and prints — would make the promise
structural. This is the one place where a `EventEmitter` is arguably the right tool (multiple
independent subscribers, no backpressure concern, fire-and-forget). It is also the least
valuable item here; note it, don't prioritise it.

---

## 9. The rule API: 26 of 36 rules independently re-walk the same AST

**Where:** [`src/rules.ts:116-138`](src/rules.ts#L116-L138),
[`src/gherkin/traverse.ts`](src/gherkin/traverse.ts)

`runEnabledRules` calls `rule.run(feature, file, config)` for each enabled rule, and each rule
walks the tree itself. Measured across the rule directory: **26 of 36 rules** call a traversal
helper (`scenariosOf`, `stepContainersOf`, `taggedNodesOf`, `backgroundsOf`, `rulesOf`); a
further 4 scan `file.lines`. With the recommended preset on, a feature file is walked more than
two dozen times.

The natural fix is the one ESLint uses, and gurkencheck **already deliberately mirrors ESLint
everywhere else**: the JSON formatter's output shape
([`formatters/json.ts:1-9`](src/formatters/json.ts#L1-L9)), the suppression-comment syntax
([`suppressions.ts:1-23`](src/suppressions.ts#L1-L23)), `--rulesdir`, the on/warn/off severity
model. ESLint's rule API is event-driven: a rule registers listeners keyed by node type, and
the linter does **one** traversal, dispatching to every listener.

```ts
export interface VisitorRule {
  readonly name: string;
  create(context: RuleContext): {
    Feature?(node: Feature): void;
    Scenario?(node: Scenario, ancestors: Ancestors): void;
    Step?(node: Step, ancestors: Ancestors): void;
    'Feature:exit'?(node: Feature): void;
  };
}
```

Secondary benefits beyond the single traversal:

- `context.report()` replaces returned arrays, so the linter attaches rule name and severity
  centrally — it already does this at [`rules.ts:133`](src/rules.ts#L133), but only after the
  fact.
- Suppressions could be applied **at report time** rather than by filtering the finished array
  afterwards ([`linter.ts:45-48`](src/linter.ts#L45-L48)) — a suppressed finding would never be
  constructed.
- Rules stop re-deriving shared facts. Several independently compute resolved step keywords via
  `resolvedStepKeywords`; a shared traversal can compute that once per container.

### Honest caveat

**This is the largest change here and the weakest justification.** The traversal is cheap —
walking a parsed Gherkin AST 26 times is not what makes a lint run slow; reading and parsing
files is. On realistic suites the saving is real but small, and it does not show up at all on
the 23-file `examples/` directory.

Do this for **rule-authoring ergonomics and extensibility**, not for speed, and do not let the
"one traversal instead of 26" framing oversell it. It also touches every single rule and the
documented public `LintRule` contract. If only some of this document gets done, this should be
last — and it is entirely reasonable to decide it is not worth it.

---

## Which flavour of "event-driven"

"Event-driven" covers three fairly different mechanisms, and the right one differs per finding.
Choosing wrong is how codebases end up with an untyped emitter at the centre of everything.

| Mechanism | Use for | Why |
|---|---|---|
| **Async generators / iterators** | #1, #2, #3, #6 — the pipeline | Backpressure for free, fully typed, cancellable by breaking the `for await`, composes with plain `for await`. No library. |
| **Visitor / listener registration** | #4, #9 — the rule API | Typed per node kind. Registration is declarative and inspectable. This is ESLint's model and it is the right one. |
| **`EventEmitter`** | #8 — diagnostics only | Genuinely multiple independent subscribers, no backpressure need. Untyped, easy to leak listeners, and silently swallows errors in handlers. Use sparingly. |

**Specifically recommended against:** a single `LintEmitter` that emits `file`, `finding`,
`progress` and `done`. It is the obvious design and it is wrong here — it gives up
backpressure (the emitter cannot slow down when a slow formatter can't keep up), gives up type
safety at every `.on()`, and makes the ordering guarantee the cross-file rules depend on
implicit rather than structural. The async-generator pipeline gives the same benefits with none
of that.

---

## Where event-driven would *not* help

Equally important, and worth writing down so nobody refactors these on momentum:

- **[`src/suppressions.ts`](src/suppressions.ts)** — a pure function over lines returning a
  predicate. Exactly right as is. (Finding #9 would call it at a different *time*; the module
  itself needs no change.)
- **[`collectStatistics`](src/stats/collect.ts#L212)** — a fold over parsed results. It should
  accept an `AsyncIterable` instead of an array (that is finding #2's twin), but its *internals*
  are correctly a plain accumulation loop. Do not event-ify the accumulator.
- **[`groupSimilar`](src/stats/similar.ts)** — inherently needs the complete step vocabulary; it
  is an all-pairs comparison ([`similar.ts:182-184`](src/stats/similar.ts#L182-L184)) with a
  union-find over the results. Cannot be made incremental without changing what it computes.
  Leave it alone.
- **[`src/gherkin/traverse.ts`](src/gherkin/traverse.ts)** — **already** the right kind of lazy
  pull-based API. These generators are good code. Replacing them with emitters would be a
  downgrade; finding #9 *consumes* them, it does not replace them.
- **[`globToRegExp`](src/util/glob.ts#L20) and everything in `src/util`** — pure functions,
  well-tested. No.
- **Config parsing and verification** — one-shot, fail-fast, runs once before anything else.
  Correct as is.

---

## Compatibility

Two of the affected types are public, exported from
[`src/index.ts`](src/index.ts) and documented with worked examples in the README:

- **`LintRule`** ([README "Custom rules"](README.md)) — affected by #4 and #9.
- **`Formatter`** ([README "Custom formatters"](README.md)) — affected by #5.

Changing either breaks third-party rules and formatters. Given the project is at 0.0.7 that is
survivable, but it is avoidable: **every change proposed above can be made additive.**

- New `LintRule` members (`onRunStart`, `onRunEnd`, `create`) are all **optional**. A rule with
  only `name` and `run` — the README's example — keeps working with no edit.
- `Formatter` becomes a union; the existing function shape remains valid.
- `lint()` keeps its exact signature; `lintStream()` is added beside it.
- `findFeatureFiles()` and `globSync()` stay; streaming variants are added beside them.

The one thing that cannot be kept is `reset()`, if #4 is taken to completion — but it can be
supported indefinitely by calling it from the default `onRunStart`.

---

## Suggested order

| # | Change | Value | Cost | Breaking |
|---|---|---|---|---|
| 1 | ~~`try/catch` per read — **fix the crash**~~ **DONE** | **High** | Trivial | No |
| 2 | ~~Bounded read-ahead, shared with `stats`~~ **DONE** | High | Small | No |
| 3 | ~~`lintStream()` async generator~~ **DONE** | High | Small | No |
| 4 | ~~Per-run rule state + `onRunStart`/`onRunEnd`~~ **DONE** | High | Medium | Additive |
| 5 | ~~Streaming formatter shape (TAP, stylish)~~ **DONE** | Medium | Medium | Additive |
| 6 | ~~`globStream` discovery~~ **DONE** | Low–Medium (see below) | Medium | Additive |
| 7 | ~~Watch mode~~ **DONE** | — | Large | New feature |
| 8 | ~~Diagnostic events replacing direct `logger`~~ **DONE** | Low | Small | Additive |
| 9 | Visitor rule API | Medium (ergonomics) | **Large** | Additive |

**Item 1 is done**, along with the five other instances of the same defect the audit turned up.
The rest of this document is unaffected by that work and still stands as written.

Items 2–4 are the good ratio: small, non-breaking, and they fix a real correctness problem
(concurrent runs) alongside the memory and I/O behaviour.

Items 5–7 are worth it *if* watch mode or editor integration is on the roadmap, and noticeably
less so otherwise. Settle that question first.

Item 9 is a genuine improvement to rule authoring and the natural end state for a linter that
mirrors ESLint this closely — but it is a large change touching all 36 rules, justified by
ergonomics rather than the performance framing it invites. Last, if at all.

---

## What has been done since

Findings 1, 3, 4 and 5 are implemented. What shipped, and where it differs from
what this document proposed:

**#4, the rule lifecycle.** Rules get a `RunContext` - one per rule per run - instead of keeping
state in the module, so two `lint()` calls at once no longer corrupt each other. `beginRun` and
`finishRun` bracket a run; `onRunStart` and `onRunEnd` are optional hooks. The three `no-dupe-*`
rules now report from `onRunEnd`, so every file involved in a duplicate is told about the
others rather than the second one being blamed for arriving second. Their message changed from
"is already used in" to "is also used in", since neither file is the later one any more. All
additive: a rule with only a `name` and a `run` still works, and `reset()` is deprecated rather
than removed.

**#3, `lintStream`.** An async generator yielding each result as its file is checked; `lint()`
collects it and is otherwise unchanged. Breaking out of the loop stops the checking.

One thing this document did not anticipate: **a cross-file rule and a result stream pull against
each other.** A rule reporting from `onRunEnd` cannot know what it has found until every file has
been seen, so a result handed over early would have to be taken back. Rather than invent a
retraction, enabling such a rule holds every result until the end - and with none enabled,
results arrive as each file is checked. That is the honest cost of the question those rules
answer, and it is worth knowing before building anything on the stream.

Reading is still done up front, so this streams the checking rather than the whole pipeline.
Finding #2 is what would fix that, and it is untouched.

**#5, streaming formatters.** `StreamingFormatter` is a *factory* returning `{start?, file, end?}`
- a factory rather than an object, so a TAP counter belongs to its run and two runs at once
cannot number each other's test points. The same reasoning as #4, one layer up. TAP now writes
test points as they arrive with a trailing plan, and stylish writes each block as its file is
done, byte for byte what it printed before. json, sarif and junit stay as they are, exactly as
argued above. A formatter of your own joins in by exporting `startRun`.

**#2, the bounded read-ahead.** `mapWithWindow` keeps at most a fixed number of reads in flight
and hands results over in the order the files were given. `readAndParseFiles` is that applied to
feature files; `lintStream` and `stats` both go through it, so the duplicated `Promise.all` this
document complained about is gone from both.

Measured on a generated suite, peak RSS:

| files | before | after |
|---|---|---|
| 4,000 | 384 MB | 158 MB |
| 12,000 | 811 MB | 210 MB |

Tripling the suite costs the old path 2.1x the memory and the new one 1.33x - what is left
growing is the accumulated results and the cross-file rule state, not the syntax trees. It is
also about 20% faster, which was not the point but is welcome.

Two things worth recording:

- The windowing lives in `src/util/stream.ts` rather than inside the parser, because a window
  holding *started* promises can only be tested by holding the work still and watching it. The
  first attempt at that test monkey-patched `fs.promises.readFile`, which does nothing to a
  static ESM import - so it passed while observing zero open files. The bound is now tested
  against an injected map, and the file-level tests only claim what they can actually see.
- `mapWithWindow` requires that its map never rejects, because a result is started before
  anything awaits it and a rejection would be unhandled. `readAndParseFile` was already
  non-throwing for read failures; it now covers the parse call too, so that promise is real
  rather than nearly true.

**#6, streaming discovery — built, and it disproved two of the claims made for it above.**

`globStream` and `findFeatureFileStream` hand files over as the walk reaches them, and
`mapWithWindow` now takes anything iterable, so discovery feeds reading directly and the four
phases are one pipeline. What the measurements said, on a tree of 2,000 feature files across
2,000 directories:

| | total time | time to first output |
|---|---|---|
| collecting first | 0.360s | 229 ms |
| streaming | 0.400s (**+11%**) | 119 ms (**-48%**) |

So the trade is the opposite way round from what this document assumed. Streaming discovery
costs a little total time and halves the time until the first finding is on screen. Worth having
for a linter someone is watching; not the free win "pays off on large trees" implied.

Two claims above were simply wrong, and both cost time to find out:

- **"`walk` already sorts each directory's entries, so a depth-first walk emits in sorted order."**
  It does not. Everything under a directory `b` has a path starting `b/`, and `-` sorts before
  `/`, so a sibling file `b-1.feature` comes *after* `b` by entry name and *before* `b/x.feature`
  by path. Streaming naively would have quietly reordered every report. Directory entries are now
  ordered as `name + '/'`, which makes the walk's order and the sorted order the same thing;
  there is a test on exactly those names.
- **"`readdirSync` blocks the event loop, so making it async is the fix."** Making it async made
  discovery ~40% slower - a promise per directory costs more than reading the directory - and
  bought nothing, because the only thing waiting on the walk is the work being fed by it. The
  walk reads each directory synchronously and gives way at every file instead. Flattening the
  recursion was tried too and changed nothing: the remaining cost is per-item async iteration,
  which is what streaming *is*.

The honest summary: #6 delivers responsiveness, not throughput, and the case for it rests on
that. If total time in CI matters more than first feedback, `findFeatureFiles` is still there and
still faster.

**#8, diagnostics.** Anything said *about* a run goes through a `Diagnostics` sink that is silent
unless given somewhere to report; the command line passes one writing to stderr, so its output is
unchanged. The README's promise that the library writes nothing to the console now holds by
construction rather than by nobody having called the logger. Three levels - error, detail, notice
- because that is what the existing output actually used. An `EventEmitter` was suggested above
and is not what shipped: there is one subscriber, and a typed sink is simpler and cheaper than an
emitter whose events nobody can see the type of.

**#7, watch mode.** `--watch` checks, waits, and checks again whenever a feature file or the
configuration changes, until Ctrl-C. `watch()` knows about watching and nothing about linting; it
takes something to run and runs it. Changes are settled for 80ms first, because saving a file is
rarely one event.

**This document's design for it was wrong, and it is worth saying why.** The plan above was to
"keep per-file parse results cached, re-run only the edited file's per-file rules, then re-run the
run-end pass over the cached set". The first half does not work: a rule that reports across files
rebuilds its state by seeing *every* file through `run`, so nothing can be skipped while one is
enabled. What caching would actually save is the reading and parsing - and it saves it by holding
every syntax tree for the life of the process, which measured at 384 MB for 4,000 files while
finding #2 was busy getting that number down to 158 MB for a single pass. For a process sitting
idle between keystrokes that is the wrong thing to spend. Every pass is a whole run; a few
thousand files take well under a second.

Watching is on the directories rather than on the files found at startup, so a file created later
is noticed - the case that watching what you found can never handle.

Two bugs the tests caught, both worth recording:

- A pass that threw escaped as an unhandled rejection and would have taken the process down,
  directly contradicting the docstring that said a failing pass does not stop the watch. Same
  isolation failure as the first commit in this series, in new code written after it.
- The first version reported "watching for changes" before the first pass had finished, so a
  caller could act on a watch that was not ready. `watch` takes an `AbortSignal` now as well as
  answering to Ctrl-C, which is what made it testable without hijacking process signals.

**Still open:** #9 (visitor rule API), and the recommendation that it go last - if at all - still
stands.
