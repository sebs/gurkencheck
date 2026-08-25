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
import {anchorFor, escapeHtml, page, pageFor} from './html.ts';
import type {RuleDoc} from './types.ts';

const OUTPUT = 'docs';
const SITE_NAME = 'gurkencheck';
const TAGLINE = 'A linter for Gherkin feature files.';

const configurable = RULE_DOCS.filter((rule) => rule.alwaysOn !== true);
const alwaysOn = RULE_DOCS.filter((rule) => rule.alwaysOn === true);

function header(depth: number): string {
  const root = depth === 0 ? '.' : '..';
  return `<header class="site"><div class="inner">
<a class="name" href="${root}/index.html">${SITE_NAME}</a>
<span class="tagline">${escapeHtml(TAGLINE)}</span>
</div></header>`;
}

function sidebar(currentRule?: string): string {
  const group = (heading: string, rules: RuleDoc[]): string => `
<h2>${escapeHtml(heading)}</h2>
<ul>${rules
    .map((rule) => {
      const current = rule.name === currentRule ? ' aria-current="page"' : '';
      return `<li><a href="../${pageFor(rule.name)}"${current}>${escapeHtml(rule.name)}</a></li>`;
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

function rulePage(rule: RuleDoc): string {
  const badge = rule.alwaysOn === true ? ' <span class="badge">Always on</span>' : '';

  const body = `${header(1)}
<div class="layout">
${sidebar(rule.name)}
<main id="main">
<h1><code>${escapeHtml(rule.name)}</code>${badge}</h1>
<p class="lede">${escapeHtml(rule.summary)}</p>

<h2>What it does</h2>
<p>${escapeHtml(rule.explanation)}</p>

<h2>Turning it on</h2>
<p>Add this to your <code>${DEFAULT_CONFIG_FILE_NAME}</code>:</p>
${codeBlock(rule.config)}

<h2>Settings</h2>
${settingsTable(rule)}

<h2>Examples</h2>
${example('good', rule.good)}
${example('bad', rule.bad, rule.message)}
</main>
</div>`;

  return page({
    title: `${rule.name} - ${SITE_NAME}`,
    description: rule.summary,
    depth: 1,
    body,
  });
}

function ruleList(rules: RuleDoc[]): string {
  return `<ul class="rule-list">${rules
    .map(
      (rule) => `<li>
<a href="${pageFor(rule.name)}"><code>${escapeHtml(rule.name)}</code></a>
<p>${escapeHtml(rule.summary)}</p>
</li>`,
    )
    .join('\n')}</ul>`;
}

function indexPage(): string {
  const body = `${header(0)}
<div class="layout single">
<main id="main">
<h1>${escapeHtml(SITE_NAME)}</h1>
<p class="lede">${escapeHtml(TAGLINE)} It reads your <code>.feature</code> files and tells you
where they drift from the conventions your team has agreed on.</p>

<h2>Install</h2>
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
<tr><td><code>-f, --format</code></td><td>Output format: <code>stylish</code> (the default), <code>json</code>, <code>tap</code> or <code>xunit</code>, or the path to a formatter of your own.</td></tr>
<tr><td><code>-c, --config</code></td><td>Path to a configuration file, if it is not <code>${DEFAULT_CONFIG_FILE_NAME}</code> in the current directory.</td></tr>
<tr><td><code>-i, --ignore</code></td><td>Comma separated globs to skip. Overrides <code>${DEFAULT_IGNORE_FILE_NAME}</code>.</td></tr>
<tr><td><code>-r, --rulesdir</code></td><td>A directory holding your own rules. May be given more than once.</td></tr>
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
<code>column</code> fields.</p>

<h2>Skipping files</h2>
<p>Put one glob per line in a <code>${DEFAULT_IGNORE_FILE_NAME}</code> file, or pass
<code>--ignore</code> on the command line. Without either, <code>node_modules</code> is skipped
and everything else is checked.</p>
<p>A pattern that matches a directory skips everything below it, the same way
<code>.gitignore</code> and <code>.eslintignore</code> work, so <code>build</code> is enough and
you do not have to write <code>build/**</code>. Blank lines and lines starting with
<code>#</code> are ignored.</p>

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
<p>The four always-on rules cannot be switched off this way. A file that breaks one of them
cannot be read at all, so hiding the message would leave nothing in its place.</p>

<h2>Rules you switch on</h2>
<p>These are all off by default. Each page shows an example that passes and one that fails.</p>
${ruleList(configurable)}

<h2>Always on</h2>
<p>These four are not really settings. They describe things Gherkin itself refuses to read,
so a file that breaks one of them cannot be checked at all.</p>
${ruleList(alwaysOn)}

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
${codeBlock('npx gurkencheck --rulesdir ./rules')}
</main>
</div>`;

  return page({
    title: `${SITE_NAME} - ${TAGLINE}`,
    description: `${TAGLINE} Documentation for every rule, with an example that passes and one that fails.`,
    depth: 0,
    body,
  });
}

/** Writes the whole site into `docs/`. */
export function build(outputDirectory: string = OUTPUT): string[] {
  fs.rmSync(outputDirectory, {recursive: true, force: true});
  fs.mkdirSync(path.join(outputDirectory, 'rules'), {recursive: true});

  const written: string[] = [];
  const write = (relativePath: string, contents: string): void => {
    fs.writeFileSync(path.join(outputDirectory, relativePath), contents);
    written.push(relativePath);
  };

  write('style.css', fs.readFileSync(path.join(import.meta.dirname, 'style.css'), 'utf8'));
  write('index.html', indexPage());
  // Tells GitHub Pages not to run the files through Jekyll.
  write('.nojekyll', '');

  for (const rule of RULE_DOCS) {
    write(pageFor(rule.name), rulePage(rule));
  }

  return written;
}

if (import.meta.filename === process.argv[1]) {
  const written = build();
  console.log(`Wrote ${written.length} files into ${OUTPUT}/`);
}
