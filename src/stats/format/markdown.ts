/**
 * The report as Markdown, for pasting into a pull request or a wiki.
 */
import type {SimilarGroup, StepEntry, Statistics} from '../types.ts';
import {head, location, percent, plural, summarise} from './shared.ts';
import type {StatsFormatOptions} from './shared.ts';

/** A pipe inside a cell would start a column of its own. */
function cell(text: string): string {
  return text.replace(/\|/gu, '\\|');
}

/** ``` `text` ```, so step text keeps its quotes and angle brackets. */
function code(text: string): string {
  return `\`${cell(text)}\``;
}

function table(headings: readonly string[], alignments: readonly string[], rows: readonly string[][]): string[] {
  return [
    `| ${headings.join(' | ')} |`,
    `|${alignments.map((alignment) => (alignment === 'right' ? '---:' : '---')).join('|')}|`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ];
}

function more(hidden: number, of: string): string[] {
  return hidden === 0 ? [] : ['', `_… and ${hidden} more ${of}._`];
}

function stepRows(entries: readonly StepEntry[], counted = true): string[][] {
  return entries.map((entry) => [
    code(entry.text),
    ...(counted ? [String(entry.count)] : []),
    cell(location(entry.file, entry.line)),
  ]);
}

function similarRows(groups: readonly SimilarGroup[]): string[][] {
  return groups.flatMap((group, index) =>
    group.members.map((member, position) => [
      position === 0 ? String(index + 1) : '',
      code(member.text),
      String(member.count),
      cell(location(member.file, member.line)),
    ]),
  );
}

/** The report, as Markdown. */
export function toMarkdown(statistics: Statistics, options: StatsFormatOptions): string {
  const {files, inventory, scenarios, steps, tags, languages} = statistics;

  if (files.total === 0) {
    return '# Feature file statistics\n\nNo feature files found.';
  }

  const counted =
    files.unreadable.length === 0
      ? plural(files.parsed, 'file')
      : `${files.parsed} of ${plural(files.total, 'file')}`;

  const lines: string[] = [
    '# Feature file statistics',
    '',
    [counted, plural(inventory.features, 'feature'), plural(scenarios.effective, 'test case')].join(
      ', ',
    ),
  ];

  lines.push('', '## Inventory', '', ...table(
    ['', 'Count'],
    ['left', 'right'],
    [
      ['Features', String(inventory.features)],
      ['Rules', String(inventory.rules)],
      ['Backgrounds', String(inventory.backgrounds)],
      ['Scenarios', String(inventory.scenarios)],
      ['Scenario Outlines', String(inventory.scenarioOutlines)],
      ['Examples tables', String(inventory.examplesTables)],
      ['Examples rows', String(inventory.examplesRows)],
      ['Steps, as written', String(inventory.steps)],
      ['Data tables', String(inventory.dataTables)],
      ['Doc strings', String(inventory.docStrings)],
    ],
  ));

  lines.push(
    '',
    '## Scenarios',
    '',
    `**${scenarios.effective}** test cases: one per Scenario, one per Examples row.`,
    '',
    `Steps per scenario, Background steps excluded: ${summarise(scenarios.stepsPerScenario)}`,
  );

  const largest = head(scenarios.largest, options.top);
  if (largest.shown.length > 0) {
    lines.push('', '### Longest scenarios', '', ...table(
      ['Scenario', 'Steps', 'Where'],
      ['left', 'right', 'left'],
      largest.shown.map((scenario) => [
        cell(scenario.name === '' ? '(unnamed)' : scenario.name),
        String(scenario.steps),
        cell(location(scenario.file, scenario.line)),
      ]),
    ), ...more(largest.hidden, 'scenarios'));
  }

  const {given, when, then, other} = steps.keywords;
  lines.push('', '## Steps', '', ...table(
    ['', 'Count', 'Share'],
    ['left', 'right', 'right'],
    [
      ['Written, Background steps included', String(steps.total), ''],
      ['Distinct after normalisation', String(steps.unique), percent(steps.unique, steps.total)],
      ['Written exactly once', String(steps.usedOnce), percent(steps.usedOnce, steps.unique)],
      ['Given', String(given), percent(given, steps.total)],
      ['When', String(when), percent(when, steps.total)],
      ['Then', String(then), percent(then, steps.total)],
      ...(other === 0 ? [] : [['Unresolved And or But', String(other), percent(other, steps.total)]]),
    ],
  ));
  lines.push('', `Words per step: ${summarise(steps.wordsPerStep)}`);

  const mostUsed = head(steps.vocabulary.filter((entry) => entry.count > 1), options.top);
  if (mostUsed.shown.length > 0) {
    lines.push(
      '',
      '### Most used steps',
      '',
      ...table(['Step', 'Uses', 'First seen'], ['left', 'right', 'left'], stepRows(mostUsed.shown)),
      ...more(mostUsed.hidden, 'steps'),
    );
  }

  const once = head(
    steps.vocabulary.filter((entry) => entry.count === 1).sort((a, b) => (a.text < b.text ? -1 : 1)),
    options.top,
  );
  if (once.shown.length > 0) {
    lines.push(
      '',
      '### Steps written exactly once',
      '',
      ...table(['Step', 'Where'], ['left', 'left'], stepRows(once.shown, false)),
      ...more(once.hidden, 'steps'),
    );
  }

  const similar = head(steps.similar, options.top);
  if (similar.shown.length > 0) {
    lines.push(
      '',
      '### Nearly the same step, written more than one way',
      '',
      ...table(
        ['Group', 'Step', 'Uses', 'Where'],
        ['right', 'left', 'right', 'left'],
        similarRows(similar.shown),
      ),
      ...more(similar.hidden, 'groups'),
    );
  }

  const untagged = inventory.scenarios + inventory.scenarioOutlines;
  lines.push('', '## Tags', '', ...table(
    ['', 'Count'],
    ['left', 'right'],
    [
      ['Written', String(tags.total)],
      ['Distinct', String(tags.unique)],
      ['Written exactly once', String(tags.usedOnce.length)],
      [
        'Scenarios with no tag, inherited or their own',
        `${tags.untaggedScenarios} (${percent(tags.untaggedScenarios, untagged)})`,
      ],
    ],
  ));

  const tagsUsed = head(tags.vocabulary, options.top);
  if (tagsUsed.shown.length > 0) {
    lines.push('', '### Most used tags', '', ...table(
      ['Tag', 'Uses'],
      ['left', 'right'],
      tagsUsed.shown.map((tag) => [code(tag.name), String(tag.count)]),
    ), ...more(tagsUsed.hidden, 'tags'));
  }

  if (tags.usedOnce.length > 0) {
    const tagsOnce = head(tags.usedOnce, options.top);
    lines.push(
      '',
      '### Tags written exactly once',
      '',
      tagsOnce.shown.map(code).join(', '),
      ...more(tagsOnce.hidden, 'tags'),
    );
  }

  if (languages.length > 1) {
    lines.push('', '## Languages', '', ...table(
      ['Dialect', 'Files'],
      ['left', 'right'],
      languages.map((language) => [code(language.code), String(language.files)]),
    ));
  }

  if (files.unreadable.length > 0) {
    const unreadable = head(files.unreadable, options.top);
    lines.push(
      '',
      `## Could not be read (${plural(files.unreadable.length, 'file')})`,
      '',
      'Nothing in these files is counted above.',
      '',
      ...table(
        ['File', 'Why'],
        ['left', 'left'],
        unreadable.shown.map((file) => [
          cell(location(file.file, file.line)),
          cell(file.reason),
        ]),
      ),
      ...more(unreadable.hidden, 'files'),
    );
  }

  return lines.join('\n');
}
