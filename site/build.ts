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
<p>The four always-on rules cannot be switched off this way. A file that breaks one of them
cannot be read at all, so hiding the message would leave nothing in its place.</p>

<h2>Rules you switch on</h2>
<p>These are all off by default. Each page shows an example that passes and one that fails.</p>
${ruleList('.', configurable)}

<h2>Always on</h2>
<p>These four are not really settings. They describe things Gherkin itself refuses to read,
so a file that breaks one of them cannot be checked at all.</p>
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
  write('404.html', notFoundPage(target));
  // Tells GitHub Pages not to run the files through Jekyll.
  write('.nojekyll', '');

  for (const rule of RULE_DOCS) {
    write(pageFor(rule.name), rulePage(rule, target));
  }

  // Everything a reader can land on, which is every page bar the 404.
  write('sitemap.xml', sitemap(['index.html', RULES_INDEX, ...RULE_DOCS.map((r) => pageFor(r.name))]));
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
