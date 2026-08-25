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
<p>Create a file called <code>${DEFAULT_CONFIG_FILE_NAME}</code> in your project and list the
rules you want. Every rule is off until you switch it on.</p>
${codeBlock(`{
  "no-unnamed-features": "on",
  "no-unnamed-scenarios": "on",
  "no-trailing-spaces": "on",
  "indentation": ["on", {"Feature": 0, "Scenario": 2, "Step": 4}]
}`)}
<p>Then run it:</p>
${codeBlock('npx gurkencheck')}
<p>With no paths given, it searches the current directory for <code>.feature</code> files.
It exits with <code>0</code> when everything is clean, <code>1</code> when a rule was broken,
and <code>2</code> when it could not run at all.</p>

<h2>Command line options</h2>
<div class="wide"><table>
<thead><tr><th>Option</th><th>What it does</th></tr></thead>
<tbody>
<tr><td><code>-f, --format</code></td><td>Output format: <code>stylish</code> (the default), <code>json</code> or <code>xunit</code>.</td></tr>
<tr><td><code>-c, --config</code></td><td>Path to a configuration file, if it is not <code>${DEFAULT_CONFIG_FILE_NAME}</code> in the current directory.</td></tr>
<tr><td><code>-i, --ignore</code></td><td>Comma separated globs to skip. Overrides <code>${DEFAULT_IGNORE_FILE_NAME}</code>.</td></tr>
<tr><td><code>-r, --rulesdir</code></td><td>A directory holding your own rules. May be given more than once.</td></tr>
<tr><td><code>-h, --help</code></td><td>Show the options.</td></tr>
<tr><td><code>-v, --version</code></td><td>Show the version number.</td></tr>
</tbody>
</table></div>

<h2>Skipping files</h2>
<p>Put one glob per line in a <code>${DEFAULT_IGNORE_FILE_NAME}</code> file, or pass
<code>--ignore</code> on the command line. Without either, <code>node_modules</code> is skipped
and everything else is checked.</p>
<p>A pattern that matches a directory skips everything below it, the same way
<code>.gitignore</code> and <code>.eslintignore</code> work, so <code>build</code> is enough and
you do not have to write <code>build/**</code>. Blank lines and lines starting with
<code>#</code> are ignored.</p>

<h2>Rules you switch on</h2>
<p>These are all off by default. Each page shows an example that passes and one that fails.</p>
${ruleList(configurable)}

<h2>Always on</h2>
<p>These four are not really settings. They describe things Gherkin itself refuses to read,
so a file that breaks one of them cannot be checked at all.</p>
${ruleList(alwaysOn)}

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
