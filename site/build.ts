/**
 * Generates the documentation site into `docs/`, which GitHub Pages serves.
 *
 * Run it with `npm run docs`.
 */
import fs from 'node:fs';
import path from 'node:path';
import {DEFAULT_CONFIG_FILE_NAME} from '../src/config-parser.ts';
import {DEFAULT_IGNORE_FILE_NAME} from '../src/feature-finder.ts';
import {RULE_DOCS} from './content.ts';
import {
  anchorFor,
  anchorHeadings,
  applicationBlock,
  breadcrumbBlock,
  escapeHtml,
  page,
  pageFor,
  tableOfContents,
  versionPicker,
  websiteBlock,
} from './html.ts';
import type {Crumb} from './html.ts';
import {version} from '../src/version.ts';
import {
  NPM_URL,
  REPO_URL,
  SITE_NAME,
  SITE_URL,
  SOCIAL_CARD,
  TAGLINE,
  absolute,
  canonical,
  inVersion,
} from './site.ts';
import type {Target} from './site.ts';
import type {RuleDoc} from './types.ts';

const OUTPUT = 'docs';
const RULES_INDEX = 'rules/index.html';
const STATS_PAGE = 'stats.html';

/** The file listing every published version, for anything that wants it. */
const VERSIONS_FILE = 'versions.json';

/** What a plain `npm run docs` builds: the latest docs, with no version picker. */
function latestTarget(): Target {
  return {version: version(), latest: true, published: []};
}

/** Files copied into the site as they are, rather than generated. */
const ASSETS = ['style.css', 'icon.svg', 'apple-touch-icon.png', SOCIAL_CARD.file];

/**
 * A description is cut off in a search result, so say the useful part first
 * and keep the whole thing short.
 */
function summarise(...sentences: string[]): string {
  const text = sentences.join(' ');
  if (text.length <= 160) return text;
  const cut = text.slice(0, 160);
  return `${cut.slice(0, cut.lastIndexOf(' '))}\u2026`;
}

const GITHUB_MARK =
  '<svg class="mark" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" ' +
  'focusable="false"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 ' +
  '5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-' +
  '.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66' +
  '.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02' +
  '.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 ' +
  '2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.' +
  '54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-' +
  '3.58-8-8-8Z"/></svg>';

const configurable = RULE_DOCS.filter((rule) => rule.alwaysOn !== true);
const alwaysOn = RULE_DOCS.filter((rule) => rule.alwaysOn === true);

/**
 * `picker` is the version picker, and is empty on the pages that do without
 * one. It is offered with the rules, because a rule is the thing that
 * differs between releases: a setting that arrived in one, a message that
 * was reworded in another. The rest of the site reads the same either way.
 */
function header(root: string, picker = ''): string {
  return `<header class="site"><div class="inner">
<a class="name" href="${root}/index.html">${SITE_NAME}</a>
<span class="tagline">${escapeHtml(TAGLINE)}</span>
<nav class="project" aria-label="Project">
${picker}
<a href="${root}/${RULES_INDEX}">Rules</a>
<a href="${root}/${STATS_PAGE}">Stats</a>
<a href="${NPM_URL}">npm</a>
<a href="${REPO_URL}">${GITHUB_MARK}GitHub</a>
</nav>
</div></header>`;
}

/** The trail from the home page to the page you are on. */
function breadcrumbs(root: string, trail: Crumb[], current: string): string {
  const links = trail
    .map((crumb) => {
      const target = crumb.path === '' ? 'index.html' : crumb.path;
      return `<li><a href="${root}/${target}">${escapeHtml(crumb.name)}</a></li>`;
    })
    .join('');

  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>${links}
<li><span aria-current="page">${escapeHtml(current)}</span></li></ol></nav>`;
}

function sidebar(root: string, currentRule?: string): string {
  const group = (heading: string, rules: RuleDoc[]): string => `
<h2>${escapeHtml(heading)}</h2>
<ul>${rules
    .map((rule) => {
      const current = rule.name === currentRule ? ' aria-current="page"' : '';
      return `<li><a href="${root}/${pageFor(rule.name)}"${current}>${escapeHtml(rule.name)}</a></li>`;
    })
    .join('')}</ul>`;

  return `<nav class="rules" aria-label="Rules">
${group('Rules you switch on', configurable)}
${group('Always on', alwaysOn)}
</nav>`;
}

function codeBlock(source: string): string {
  return `<pre><code>${escapeHtml(source)}</code></pre>`;
}

function example(kind: 'good' | 'bad', source: string, outcome?: string): string {
  const label = kind === 'good' ? 'Passes' : 'Fails';
  const mark = kind === 'good' ? '&#10003;' : '&#10007;';
  const footer =
    outcome === undefined
      ? ''
      : `<p class="outcome">${escapeHtml(SITE_NAME)} reports: <code>${escapeHtml(outcome)}</code></p>`;
  return `<div class="example ${kind}">
<div class="label"><span aria-hidden="true">${mark}</span> ${label}</div>
${codeBlock(source)}
${footer}
</div>`;
}

function settingsTable(rule: RuleDoc): string {
  if (rule.settings === undefined || rule.settings.length === 0) {
    return `<p>This rule has no settings. Switch it on with <code>"${escapeHtml(rule.name)}": "on"</code>.</p>`;
  }

  const rows = rule.settings
    .map(
      (setting) => `<tr id="${anchorFor(`${rule.name}-${setting.name}`)}">
<td><code>${escapeHtml(setting.name)}</code></td>
<td>${escapeHtml(setting.type)}</td>
<td><code>${escapeHtml(setting.fallback)}</code></td>
<td>${escapeHtml(setting.description)}</td>
</tr>`,
    )
    .join('\n');

  return `<div class="wide"><table>
<thead><tr><th>Setting</th><th>Value</th><th>If you leave it out</th><th>What it does</th></tr></thead>
<tbody>
${rows}
</tbody>
</table></div>`;
}

function rulePage(rule: RuleDoc, target: Target): string {
  const badge = rule.alwaysOn === true ? ' <span class="badge">Always on</span>' : '';
  const filePath = pageFor(rule.name);
  const url = canonical(filePath);
  const trail: Crumb[] = [
    {name: SITE_NAME, path: ''},
    {name: 'Rules', path: RULES_INDEX},
  ];

  const sections = `<h2>What it does</h2>
<p>${escapeHtml(rule.explanation)}</p>

<h2>Turning it on</h2>
<p>Add this to your <code>${DEFAULT_CONFIG_FILE_NAME}</code>:</p>
${codeBlock(rule.config)}

<h2>Settings</h2>
${settingsTable(rule)}

<h2>Examples</h2>
${example('good', rule.good)}
${example('bad', rule.bad, rule.message)}`;

  const body = `${header('..', versionPicker(filePath, target))}
<div class="layout">
${sidebar('..', rule.name)}
<main id="main">
${breadcrumbs('..', trail, rule.name)}
<h1><code>${escapeHtml(rule.name)}</code>${badge}</h1>
<p class="lede">${escapeHtml(rule.summary)}</p>

${anchorHeadings(sections).html}
</main>
</div>`;

  const description = summarise(
    rule.summary,
    rule.alwaysOn === true
      ? `An always-on ${SITE_NAME} rule for Gherkin feature files, with examples that pass and fail.`
      : `A ${SITE_NAME} rule for Gherkin feature files, with its settings and examples that pass and fail.`,
  );

  // A long rule name plus a long suffix is cut off in a search result, so the
  // longest names get the short suffix.
  const suffix = rule.name.length > 24 ? SITE_NAME : `${SITE_NAME} rule for Gherkin`;

  return page({
    title: `${rule.name} \u2013 ${suffix}`,
    description,
    path: filePath,
    target,
    root: '..',
    kind: 'article',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: rule.name,
        name: rule.name,
        description,
        url,
        inLanguage: 'en',
        isPartOf: websiteBlock(),
        about: {'@type': 'SoftwareApplication', name: SITE_NAME, url: absolute('')},
      },
      breadcrumbBlock([...trail, {name: rule.name, path: filePath}]),
    ],
    body,
  });
}

/** A page listing every rule, so `rules/` is somewhere rather than a 404. */
function rulesIndexPage(target: Target): string {
  const url = canonical(RULES_INDEX);
  const trail: Crumb[] = [{name: SITE_NAME, path: ''}];
  const description = summarise(
    `Every one of the ${RULE_DOCS.length} rules ${SITE_NAME} can check a Gherkin feature file against,`,
    'each with an example that passes and one that fails.',
  );

  const body = `${header('..', versionPicker(RULES_INDEX, target))}
<div class="layout">
${sidebar('..')}
<main id="main">
${breadcrumbs('..', trail, 'Rules')}
<h1>Rules</h1>
<p class="lede">All ${RULE_DOCS.length} of them. Each page shows what the rule does, how to
switch it on, what you can set, and an example that passes next to one that fails.</p>

${
    anchorHeadings(`<h2>Rules you switch on</h2>
<p>Off unless a configuration file names them, or unless you are using the recommended
set.</p>
${ruleList('..', configurable)}

<h2>Always on</h2>
<p>These describe things Gherkin itself refuses to read, so a file that breaks one of them
cannot be checked at all.</p>
${ruleList('..', alwaysOn)}`).html
  }
</main>
</div>`;

  return page({
    title: `All ${RULE_DOCS.length} rules \u2013 ${SITE_NAME}`,
    description,
    path: RULES_INDEX,
    target,
    root: '..',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Rules',
        description,
        url,
        isPartOf: websiteBlock(),
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: RULE_DOCS.length,
          itemListElement: RULE_DOCS.map((rule, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: rule.name,
            url: canonical(pageFor(rule.name)),
          })),
        },
      },
      breadcrumbBlock([...trail, {name: 'Rules', path: RULES_INDEX}]),
    ],
    body,
  });
}

function ruleList(root: string, rules: RuleDoc[]): string {
  return `<ul class="rule-list">${rules
    .map(
      (rule) => `<li>
<a href="${root}/${pageFor(rule.name)}"><code>${escapeHtml(rule.name)}</code></a>
<p>${escapeHtml(rule.summary)}</p>
</li>`,
    )
    .join('\n')}</ul>`;
}

function indexPage(target: Target): string {
  const intro = `<h1>${escapeHtml(SITE_NAME)}</h1>
<p class="lede">${escapeHtml(TAGLINE)} It reads your <code>.feature</code> files and tells you
where they drift from the conventions your team has agreed on.</p>`;

  const sections = `<h2>Install</h2>
${codeBlock('npm install --save-dev gurkencheck')}

<h2>Get started</h2>
<p>Run it. With no configuration file, gurkencheck uses its <strong>recommended</strong>
rules: the ones that catch a mistake rather than express a preference &mdash; an empty file,
a scenario with no name, a variable that will never be substituted. Nothing in that set
depends on how you lay a file out, so it should be quiet on a codebase that has never been
linted.</p>
${codeBlock('npx gurkencheck')}
<p>When you want something different, create a file called
<code>${DEFAULT_CONFIG_FILE_NAME}</code> and list the rules you want. A configuration file
replaces the recommended set rather than adding to it, so every rule is off until you switch
it on.</p>
<p>A rule is set to <code>"on"</code>, <code>"warn"</code> or <code>"off"</code>.
<code>"warn"</code> reports exactly the same findings but does not fail the run, which is
what you want for a rule the team is working towards rather than enforcing.</p>
${codeBlock(`{
  "no-unnamed-features": "on",
  "no-unnamed-scenarios": "on",
  "no-trailing-spaces": "on",
  "indentation": ["on", {"Feature": 0, "Scenario": 2, "Step": 4}]
}`)}
<p>With no paths given, it searches the current directory for <code>.feature</code> files.
It exits with <code>0</code> when there is nothing worse than a warning, <code>1</code> when
a rule set to <code>"on"</code> was broken, and <code>2</code> when it could not run at all.</p>

<h2>Feature files in another language</h2>
<p>Gherkin is translated into dozens of languages. A file says which one it is written in
with a header on its first line:</p>
${codeBlock(`# language: fr
Fonctionnalité: Se déconnecter

  Scénario: Se déconnecter
    Quand Ulrick se déconnecte`)}
<p>If every file in your project is written in the same language, set it once instead, with
<code>--language fr</code> or a <code>language</code> key in your configuration file. A header
in a file always wins over that setting, so a project can be mostly one language with
exceptions.</p>

<h2>Sharing a configuration</h2>
<p>Build on top of another configuration with <code>extends</code>. What your file says wins
over what it extends, and later entries in a list win over earlier ones.</p>
${codeBlock(`{
  "extends": "gurkencheck:recommended",
  "indentation": ["on", {"Step": 4}],
  "no-trailing-spaces": "off"
}`)}
<p>An entry is one of three things:</p>
<div class="wide"><table>
<thead><tr><th>Entry</th><th>What it means</th></tr></thead>
<tbody>
<tr><td><code>gurkencheck:recommended</code></td><td>The built-in recommended rules.</td></tr>
<tr><td><code>./team/.gurkencheckrc</code></td><td>Another file, resolved from the file doing the extending.</td></tr>
<tr><td><code>@acme/gurkencheck-config</code></td><td>An installed package exporting a configuration, as JSON or as a module.</td></tr>
</tbody>
</table></div>

<h2>Command line options</h2>
<div class="wide"><table>
<thead><tr><th>Option</th><th>What it does</th></tr></thead>
<tbody>
<tr><td><code>-f, --format</code></td><td>Output format: <code>stylish</code> (the default), <code>json</code>, <code>junit</code>, <code>sarif</code> or <code>tap</code>, or the path to a formatter of your own.</td></tr>
<tr><td><code>-c, --config</code></td><td>Path to a configuration file, if it is not <code>${DEFAULT_CONFIG_FILE_NAME}</code> in the current directory.</td></tr>
<tr><td><code>-i, --ignore</code></td><td>Comma separated globs to skip. Overrides <code>${DEFAULT_IGNORE_FILE_NAME}</code>.</td></tr>
<tr><td><code>-r, --rulesdir</code></td><td>A directory holding your own rules. May be given more than once.</td></tr>
<tr><td><code>-l, --language</code></td><td>The dialect to read files in when they carry no <code>#&nbsp;language:</code> header.</td></tr>
<tr><td><code>-h, --help</code></td><td>Show the options.</td></tr>
<tr><td><code>-v, --version</code></td><td>Show the version number.</td></tr>
</tbody>
</table></div>

<h2>Reading the output</h2>
<p>Findings go to <strong>stdout</strong>, so <code>gurkencheck &gt; report.json</code> and
<code>gurkencheck | less</code> work. Anything that stops the linter running &mdash; a bad
option, an invalid configuration &mdash; goes to stderr, so it never lands in a redirected
report.</p>
<p>Each finding is printed as <code>line:column&nbsp;&nbsp;&nbsp;&nbsp;message&nbsp;&nbsp;&nbsp;&nbsp;rule</code>.
Both numbers start at 1, so an editor can underline exactly the right text. A finding about a
whole file or a whole line &mdash; a missing new line at the end of the file, say &mdash; shows
the line on its own. The <code>json</code> format carries the same <code>line</code> and
<code>column</code> fields, in the same shape eslint's JSON formatter uses, so tools built
around that already understand it.</p>

<h2>Counting what is in your files</h2>
<p>The same files answer a different question. Before a team agrees a convention it helps to
know what it already has: how many test cases will really run, how much of the step vocabulary
is shared, and how much of it is the same sentence written twice. <code>gurkencheck stats</code>
counts your feature files rather than checking them.</p>
${codeBlock('npx gurkencheck stats')}
<p>It exits <code>0</code> whatever it finds, so it can sit in a build without ever failing
one. The word <code>stats</code> has to come first, before any option, because the command has
a <code>--format</code> of its own whose values have nothing to do with the linter's.
<a href="./${STATS_PAGE}">Feature file statistics</a> goes through what each number means.</p>

<h2>Skipping files</h2>
<p>Put one glob per line in a <code>${DEFAULT_IGNORE_FILE_NAME}</code> file, or pass
<code>--ignore</code> on the command line. Without either, <code>node_modules</code> is skipped
and everything else is checked.</p>
<p>A pattern that matches a directory skips everything below it, the same way
<code>.gitignore</code> and <code>.eslintignore</code> work, so <code>build</code> is enough and
you do not have to write <code>build/**</code>. Blank lines and lines starting with
<code>#</code> are ignored.</p>

<h2>Reporting to GitHub code scanning</h2>
<p><code>--format sarif</code> writes a SARIF 2.1.0 log, which GitHub reads directly. Upload
it and each finding is shown inline on the pull request that introduced it.</p>
${codeBlock(`- run: npx gurkencheck --format sarif > gurkencheck.sarif
  continue-on-error: true

- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: gurkencheck.sarif`)}
<p>Paths in the log are relative to the directory gurkencheck ran in, which is what code
scanning needs in order to match a finding to a file in the repository.</p>

<h2>Switching a rule off for one place</h2>
<p>Ignoring a whole file is often too blunt: one long step name should not cost you every
other check in that file. Write a comment in the feature file instead.</p>
${codeBlock(`# gurkencheck-disable-next-line name-length
  Scenario: A name that is long for a good reason and stays that way

# gurkencheck-disable use-and, name-length
  ... everything below here skips those two rules ...
# gurkencheck-enable use-and

# gurkencheck-disable-file no-trailing-spaces`)}
<div class="wide"><table>
<thead><tr><th>Directive</th><th>What it covers</th></tr></thead>
<tbody>
<tr><td><code>gurkencheck-disable-next-line</code></td><td>The line directly below the comment.</td></tr>
<tr><td><code>gurkencheck-disable</code></td><td>From the comment to the end of the file, or to the next <code>gurkencheck-enable</code>.</td></tr>
<tr><td><code>gurkencheck-enable</code></td><td>Resumes the rules a <code>gurkencheck-disable</code> switched off.</td></tr>
<tr><td><code>gurkencheck-disable-file</code></td><td>The whole file, wherever the comment appears.</td></tr>
</tbody>
</table></div>
<p>Name the rules you mean, separated by commas or spaces. A directive naming no rules
covers all of them. Comments inside a doc string are text and are left alone.</p>
<p>The ${alwaysOn.length} always-on rules cannot be switched off this way. A file that breaks
one of them cannot be read at all, so hiding the message would leave nothing in its place.</p>

<h2>Rules you switch on</h2>
<p>These are all off by default. Each page shows an example that passes and one that fails.</p>
${ruleList('.', configurable)}

<h2>Always on</h2>
<p>These ${alwaysOn.length} are not really settings. They describe things Gherkin itself
refuses to read, so a file that breaks one of them cannot be checked at all.</p>
${ruleList('.', alwaysOn)}

<h2>Writing your own formatter</h2>
<p>Pass a path or a package name to <code>--format</code>. The module exports a function
taking the results; it may print the output itself, or return it as a string and let
gurkencheck print it.</p>
${codeBlock(`// count.mjs
export default function count(results) {
  const findings = results.reduce((total, file) => total + file.errors.length, 0);
  return \`\${findings} findings in \${results.length} files\`;
}`)}
${codeBlock('npx gurkencheck --format ./count.mjs')}
<p>Each result is <code>{filePath, errors}</code>, and each error is
<code>{message, rule, line, column, severity}</code>. A default export, a
<code>printResults</code> export, or a module that is itself the function all work.</p>

<h2>Writing your own rule</h2>
<p>Point <code>--rulesdir</code> at a directory of your own modules. Each one exports an object
with a <code>name</code> and a <code>run</code> function, and gets called once per file.</p>
${codeBlock(`// rules/no-lorem.js
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
};`)}
<p><code>run</code> may also be <code>async</code> and return a promise, for a rule that has
to wait for something &mdash; reading a file, or asking an issue tracker whether a tag
refers to a real ticket. Files are checked one after another, so rules see a predictable
order.</p>
<p>Then switch it on by name, the same as any built-in rule:</p>
${codeBlock('npx gurkencheck --rulesdir ./rules')}`;

  const {html, headings} = anchorHeadings(sections);
  const description = summarise(
    TAGLINE,
    `Install it, switch on the ${RULE_DOCS.length} rules your team wants,`,
    'and see an example that passes and one that fails for each of them.',
  );

  const body = `${header('.')}
<div class="layout single">
<main id="main">
${intro}
${tableOfContents(headings)}
${html}
</main>
</div>`;

  return page({
    title: `${SITE_NAME} \u2013 ${TAGLINE.replace(/\.$/, '')}`,
    description,
    path: 'index.html',
    target,
    root: '.',
    jsonLd: [
      applicationBlock(description),
      {'@context': 'https://schema.org', ...websiteBlock()},
    ],
    body,
  });
}

/**
 * A real report, from a small suite of shop feature files, run with
 * `--top 3` so that the whole of it fits on the page.
 */
const SAMPLE_REPORT = `9 files, 9 features, 38 test cases

Inventory
  Features              9
  Rules                 2
  Backgrounds           8
  Scenarios            23
  Scenario Outlines     5
  Examples tables       5   15 rows
  Steps               104   as written
  Data tables           0
  Doc strings           0

Scenarios
  Test cases           38   one per Scenario, one per Examples row
  Steps per scenario   min 2   median 3   p90 4   max 4   mean 3.3   Background steps excluded

  Longest
    4  Adding the first item         features/basket.feature:7
    4  Checking out with no address  features/checkout.feature:15
    4  Choosing next day delivery    features/delivery.feature:4
    … and 25 more scenarios

Steps
  Written          104   Background steps included
  Distinct          63   61% of all steps - lower is more reuse
  Written once      43   68% of distinct steps
  Words per step   min 3   median 6   p90 7   max 10   mean 5.7
  Keywords         Given 39 (38%)   When 29 (28%)   Then 36 (35%)   And and But resolved to what they follow

  Most used
    8  i am signed in as ""         features/basket.feature:5
    6  i have 0 items in my basket  features/checkout.feature:6
    4  i check out                  features/checkout.feature:12
    … and 17 more steps

  Written once
    i add "" to my wishlist            features/wishlist.feature:8
    i add <> of "" to my basket        features/basket.feature:26
    i am asked for a delivery address  features/checkout.feature:18
    … and 40 more steps

  Nearly the same (6 groups)
    8  i am signed in as ""  features/basket.feature:5
    1  i'm signed in as ""   features/wishlist.feature:5

    6  i have 0 items in my basket  features/checkout.feature:6
    2  i have 0 item in my basket   features/basket.feature:14

    4  i have a delivery address on file   features/checkout.feature:11
    1  i have no delivery address on file  features/checkout.feature:16
    … and 3 more groups

Tags
  Written              13
  Distinct             10
  Written once          7   a tag written once is often a typo of one written often
  Untagged scenarios    0   0% of scenarios, counting inherited tags

  Most used
    2  @account
    2  @checkout
    2  @slow

  Written once
    @basket, @delivery, @payment
    … and 4 more tags`;

/** The near-duplicate section of the same run, at the default `--top`. */
const SAMPLE_SIMILAR = `  Nearly the same (6 groups)
    8  i am signed in as ""  features/basket.feature:5
    1  i'm signed in as ""   features/wishlist.feature:5

    6  i have 0 items in my basket  features/checkout.feature:6
    2  i have 0 item in my basket   features/basket.feature:14

    4  i have a delivery address on file   features/checkout.feature:11
    1  i have no delivery address on file  features/checkout.feature:16

    2  my basket has 0 item   features/basket.feature:10
    1  my basket has 0 items  features/basket.feature:16

    2  the delivery cost is 0   features/delivery.feature:8
    1  the delivery cost is <>  features/delivery.feature:20

    1  the basket total is 0   features/basket.feature:11
    1  the basket total is <>  features/basket.feature:27`;


/**
 * The page for the `stats` command.
 *
 * It sits at the top level rather than under `rules/`, because it documents a
 * second command rather than a rule: it has options of its own, a `--format`
 * whose values have nothing to do with the linter's, and an exit code that
 * never fails a build. It carries no version picker for the same reason the
 * home page does not - and because each release is rebuilt from its own tag,
 * so the releases before this page existed have no copy of it to link to.
 */
function statsPage(target: Target): string {
  const url = canonical(STATS_PAGE);
  const trail: Crumb[] = [{name: SITE_NAME, path: ''}];
  const description = summarise(
    `${SITE_NAME} stats counts what is in your feature files: the test cases that really run,`,
    'the shared step vocabulary, and the steps written two ways.',
  );

  const sections = `<h2>Running it</h2>
<p>The linter tells you what is wrong with your feature files. The same files answer a
different question &mdash; how much is there, and how much of it is the same thing written
twice &mdash; and <code>stats</code> is the command that asks it. There is nothing to
configure.</p>
${codeBlock('npx gurkencheck stats features')}
<p>With no paths given it searches the current directory, the same way the linter does. The
word <code>stats</code> has to come first, before any option. Written anywhere else it is read
as a path rather than as a command, so <code>gurkencheck --format json stats</code> reports
that there is no such file &mdash; or quietly lints a directory, if one of that name happens
to exist.</p>
<p>The report goes to stdout, so <code>gurkencheck stats &gt; report.txt</code> works. It
exits <code>0</code> whatever it finds. Statistics describe a suite rather than judge it, and
nothing here should ever be the reason a build goes red.</p>

<h2>The report</h2>
<p>This is the whole of it for a small shop's worth of feature files. Every list in it is the
head of a longer one, cut to the number of entries <code>--top</code> allows and marked with
how many were left out; this run asked for three, to keep it short.</p>
${codeBlock(SAMPLE_REPORT)}
<p>The sections below walk it in the order it prints, because several of the numbers count
something slightly different from what their name suggests.</p>

<h2>Test cases, not scenarios</h2>
<p>These files hold 23 Scenarios and 5 Scenario Outlines, and the suite runs 38 tests. An
Outline is not one test. It is one per row of its Examples table, and the five tables here
carry 15 rows between them. That is the figure that predicts how long a run takes, and it is
almost always higher than the one people carry in their heads.</p>
<p>An Outline that has no Examples table yet counts as one, which is how
<a href="./${pageFor('max-scenarios-per-file')}"><code>max-scenarios-per-file</code></a>
counts it as well, so the two never disagree about the size of a suite.</p>

<h2>Two numbers called steps</h2>
<p>The report prints 104 steps written and a median of 3 steps per scenario, and the two do
not reach each other: 104 steps across 28 scenarios would be 3.7 apiece. They count different
things. The 104 is every step in the files, Background steps included &mdash; 11 of them here
&mdash; because every one of them still needs a step definition behind it. The steps per
scenario leave Backgrounds out, because a Background is written once and read many times, and
charging it to every scenario would make a tidy suite look long-winded.</p>
<p>The summary line is five real numbers rather than an average and a guess: the
<code>min</code>, <code>median</code>, <code>p90</code> and <code>max</code> are each a step
count that some scenario in your files actually has. A mean of 3.3 would hide a forty-step
scenario; the <code>Longest</code> list underneath names it and says where it is.</p>

<h2>What makes two steps the same step</h2>
<p>Distinct is the number worth watching, and what it means depends entirely on when two
steps count as one. <code>I have 3 items in my basket</code> and
<code>I have 17 items in my basket</code> are one step behind one step definition, and
counting them as two would make every measure of reuse meaningless.</p>
<p>So before two steps are compared, the parts a step definition would capture are replaced
by a marker. A number becomes <code>0</code>, a double quoted string becomes
<code>""</code>, and a Scenario Outline placeholder becomes <code>&lt;&gt;</code>. Case,
repeated spaces and a full stop at the end are ignored. The keyword is left out altogether,
so a <code>Given</code> and an <code>And</code> of the same sentence are one step.</p>
<p>Single quotes are left exactly as they are. <code>the user's basket is 'empty'</code> has
three of them, and a rule that paired them up would eat half the sentence. Cucumber's own
expressions quote with <code>"</code> in any case.</p>
<p>Each kind of argument keeps a marker of its own, so <code>the delivery cost is 0</code> and
<code>the delivery cost is &lt;&gt;</code> stay apart. That understates reuse a little in a
suite full of Outlines, and it is the trade worth making: the normalised text is what the
report shows you, and a <code>0</code> in a step that has no number in it would be a lie
about the file. The next section puts the two back together.</p>
<p>A low share of distinct steps means the team shares a vocabulary. A high one means
everybody invents their own phrasing, and the step definitions rot.</p>

<h2>Steps written two ways</h2>
<p>This is the part of the report you can act on the same afternoon. Each group is one
behaviour that is costing you more than one step definition.</p>
${codeBlock(SAMPLE_SIMILAR)}
<p>Two steps are grouped when at most three single character edits turn one into the other,
and when those edits are no more than about a seventh of the longer of the two. Steps shorter
than eight characters are left out, because at that length almost everything looks like
everything. Three edits is deliberately tight: further apart than that and a step is a
different sentence rather than the same one spelled two ways.</p>
<p>A group may be a chain. Where one step is close to a second and the second is close to a
third, all three are reported together even though the first and the third are not close to
each other, so a phrasing that drifted over three years arrives as one group rather than
two.</p>
<p>Nothing on the command line changes how close two steps have to be. A script can:
<code>collectStatistics</code> takes a <code>similarity</code> setting.</p>

<h2>Tags nobody agreed on</h2>
<p>Seven of the ten tags here are written exactly once. Some of those are deliberate. The
rest are what a tag looks like when it was typed from memory: <code>@wishlst</code> sits in
that list a few characters from <code>@wishlist</code>, and a run filtered on either of them
quietly misses the other's scenarios.</p>
<p>Untagged scenarios counts the ones carrying no tag of their own and inheriting none from
their Feature or their Rule, and so reachable by no tag expression at all. A tag on a Feature
covers every scenario inside it, which is why that figure is zero here and often is.</p>

<h2>Keeping the report beside a build</h2>
<p>The text report is for reading. The other two formats are for keeping and for showing to
somebody else.</p>
${codeBlock('npx gurkencheck stats features --format json > stats.json')}
<p><code>--format json</code> writes the whole dataset with none of the lists cut short:
every distinct step, every scenario, every group, and every file that could not be read. It
is indented rather than packed onto one line, so two runs of it can be read side by side and
a build can keep a record of what the suite looked like when it went out. <code>--top</code>
does not apply to it.</p>
<p><code>--format md</code> writes the same report as Markdown tables, for pasting into a
pull request where the person who has to agree to the work is not going to run the command
themselves.</p>

<h2>Options</h2>
<div class="wide"><table>
<thead><tr><th>Option</th><th>What it does</th></tr></thead>
<tbody>
<tr><td><code>-f, --format</code></td><td>Output format: <code>text</code> (the default), <code>json</code> or <code>md</code>. These are the stats command's own formats; the linter's do not apply here.</td></tr>
<tr><td><code>-i, --ignore</code></td><td>Comma separated globs to skip. Replaces <code>${DEFAULT_IGNORE_FILE_NAME}</code> rather than adding to it.</td></tr>
<tr><td><code>-l, --language</code></td><td>The dialect to read files in when they carry no <code>#&nbsp;language:</code> header. This command does not read <code>${DEFAULT_CONFIG_FILE_NAME}</code>, so a <code>language</code> key there does not reach it.</td></tr>
<tr><td><code>--top</code></td><td>How many entries each list in the text and Markdown reports shows. Ten by default, and it changes nothing under <code>--format json</code>, which never cuts a list short.</td></tr>
<tr><td><code>-h, --help</code></td><td>Show the options.</td></tr>
</tbody>
</table></div>
<p>Everything the command can refuse is refused before a file is read: a format that does not
exist, a <code>--top</code> that is not a whole number, a language code that is not a
dialect, a path that names nothing. Any of those exits <code>2</code>. Once a report has been
produced it exits <code>0</code>, whatever the numbers say.</p>

<h2>What is not counted</h2>
<p>A file the parser refuses is listed at the end of the report and counted nowhere in it.
Half a broken file is worse than none of it, because every number above it would quietly be
wrong. That list is wider than files with a syntax error in them: it also holds the ones
breaking a rule Gherkin itself enforces &mdash; two Features in one file, a second
Background, a tag on a Background &mdash; which are the ${alwaysOn.length}
<a href="./${RULES_INDEX}">always-on rules</a>.</p>
<p>Nothing on this page has an opinion. There is no threshold to cross, no figure that turns
the report red, and no advice about what a good reuse number looks like &mdash; a target
invented here would be quoted back as a standard. The report says
<code>lower is more reuse</code> and stops there. What to do about it is yours, and holding a
team to it afterwards is what the <a href="./${RULES_INDEX}">rules</a> are for.</p>`;

  const {html, headings} = anchorHeadings(sections);

  const body = `${header('.')}
<div class="layout single">
<main id="main">
${breadcrumbs('.', trail, 'Statistics')}
<h1>Feature file statistics</h1>
<p class="lede">A suite of feature files grows one scenario at a time, so nobody knows what it
adds up to. <code>gurkencheck stats</code> counts it: how many test cases really run, how much
of the step vocabulary is shared, and where the same sentence has been written two ways.</p>
${tableOfContents(headings)}
${html}
</main>
</div>`;

  return page({
    title: `Feature file statistics \u2013 ${SITE_NAME}`,
    description,
    path: STATS_PAGE,
    target,
    root: '.',
    kind: 'article',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: 'Feature file statistics',
        name: 'Feature file statistics',
        description,
        url,
        inLanguage: 'en',
        isPartOf: websiteBlock(),
        about: {'@type': 'SoftwareApplication', name: SITE_NAME, url: absolute('')},
      },
      breadcrumbBlock([...trail, {name: 'Statistics', path: STATS_PAGE}]),
    ],
    body,
  });
}

/**
 * The page GitHub Pages serves for an address that is not there.
 *
 * It is served from any depth, so everything it points at is absolute rather
 * than relative to a directory the reader was never in.
 */
function notFoundPage(target: Target): string {
  const body = `${header(SITE_URL)}
<div class="layout single">
<main id="main">
<h1>Page not found</h1>
<p class="lede">That address is not part of this site. It may have moved when a rule was
renamed.</p>
<p><a href="${absolute('')}">Start from the home page</a>, or
<a href="${absolute(RULES_INDEX)}">look through the list of rules</a>.</p>
</main>
</div>`;

  return page({
    title: `Page not found \u2013 ${SITE_NAME}`,
    description: 'That address is not part of this site.',
    path: '404.html',
    target,
    root: SITE_URL,
    noindex: true,
    body,
  });
}

/** The list of pages, so a search engine does not have to guess at them. */
function sitemap(paths: string[]): string {
  const urls = paths
    .map((filePath) => `  <url><loc>${escapeHtml(canonical(filePath))}</loc></url>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

/**
 * The published versions, for anything that wants to offer a way between them.
 *
 * The pages carry their own picker, so nothing on the site reads this file;
 * it is here for the things that are not pages.
 */
function versionsJson(target: Target): string {
  const newest = target.published[0] ?? target.version;

  return `${JSON.stringify(
    {
      latest: {version: newest, url: inVersion(undefined, '')},
      versions: target.published.map((released) => ({
        version: released,
        url: inVersion(released, ''),
      })),
    },
    null,
    2,
  )}\n`;
}

/** Everything here is meant to be read, so nothing is disallowed. */
function robots(): string {
  return `User-agent: *
Allow: /

Sitemap: ${absolute('sitemap.xml')}
`;
}

/**
 * Writes one copy of the site into `outputDirectory`.
 *
 * Called once for the latest docs at the root, and once more for each release
 * being republished under its own version number.
 */
export function build(outputDirectory: string = OUTPUT, target: Target = latestTarget()): string[] {
  fs.rmSync(outputDirectory, {recursive: true, force: true});
  fs.mkdirSync(path.join(outputDirectory, 'rules'), {recursive: true});

  const written: string[] = [];
  const write = (relativePath: string, contents: string): void => {
    fs.writeFileSync(path.join(outputDirectory, relativePath), contents);
    written.push(relativePath);
  };

  // The stylesheet, the icons and the link preview image are copied byte for
  // byte: two of them are PNGs, which do not survive being read as text.
  for (const asset of ASSETS) {
    fs.copyFileSync(path.join(import.meta.dirname, asset), path.join(outputDirectory, asset));
    written.push(asset);
  }

  write('index.html', indexPage(target));
  write(RULES_INDEX, rulesIndexPage(target));
  write(STATS_PAGE, statsPage(target));
  write('404.html', notFoundPage(target));
  // Tells GitHub Pages not to run the files through Jekyll.
  write('.nojekyll', '');

  for (const rule of RULE_DOCS) {
    write(pageFor(rule.name), rulePage(rule, target));
  }

  // Everything a reader can land on, which is every page bar the 404.
  write(
    'sitemap.xml',
    sitemap(['index.html', RULES_INDEX, STATS_PAGE, ...RULE_DOCS.map((r) => pageFor(r.name))]),
  );
  write('robots.txt', robots());

  // Only the copy at the root: an archived version is a snapshot, and the
  // list of what came after it belongs with the docs that are current.
  if (target.latest && target.published.length > 0) {
    write(VERSIONS_FILE, versionsJson(target));
  }

  return written;
}

if (import.meta.filename === process.argv[1]) {
  // The version being built and the ones already published come from the
  // environment, so that assembling the whole site stays outside the
  // generator: it builds one copy and knows nothing about the others.
  const {DOCS_VERSION, DOCS_LATEST, DOCS_PUBLISHED} = process.env;
  const target: Target = {
    version: DOCS_VERSION === undefined || DOCS_VERSION === '' ? version() : DOCS_VERSION,
    latest: DOCS_LATEST !== 'false',
    published: (DOCS_PUBLISHED ?? '').split(/[\s,]+/).filter((entry) => entry !== ''),
  };

  const written = build(OUTPUT, target);
  const what = target.latest ? 'the latest docs' : `the docs for ${target.version}`;
  console.log(`Wrote ${written.length} files of ${what} into ${OUTPUT}/`);
}
