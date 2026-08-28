/**
 * The report as something to read in a terminal.
 *
 * Every list here is the head of a longer one held in the JSON report, cut to
 * `--top` entries and marked with how many were left out.
 */
import {style} from '../../logger.ts';
import type {SimilarGroup, StepEntry, Statistics} from '../types.ts';
import {andMore, head, location, percent, plural, summarise} from './shared.ts';
import type {StatsFormatOptions} from './shared.ts';

/** Longer than this and a step is a paragraph; the report shows the start. */
const TEXT_WIDTH = 90;

function truncate(text: string, width = TEXT_WIDTH): string {
  return text.length <= width ? text : `${text.slice(0, width - 1)}…`;
}

/** One line of a label-and-number block. */
interface Row {
  label: string;
  value: string;
  note?: string;
  /**
   * A value that is a phrase rather than a number - a distribution, say. It
   * starts where the numbers start but is not padded to their width, so that
   * one long value does not push every number across the screen.
   */
  wide?: boolean;
}

/** Lays out a block so the numbers line up under each other. */
function block(entries: readonly Row[]): string[] {
  const labelWidth = entries.reduce((widest, row) => Math.max(widest, row.label.length), 0);
  const valueWidth = entries.reduce(
    (widest, row) => (row.wide === true ? widest : Math.max(widest, row.value.length)),
    0,
  );

  return entries.map((row) => {
    const value = row.wide === true ? row.value : row.value.padStart(valueWidth);
    const line = `  ${row.label.padEnd(labelWidth)}   ${value}`;
    return row.note === undefined ? line : `${line}   ${style.gray(row.note)}`;
  });
}

/** One entry of a list: a text, optionally counted, optionally located. */
interface Entry {
  /** Left out when every entry in the list would show the same count. */
  count?: number;
  text: string;
  where?: string;
}

/** A list of `count  text  where` lines, with each column lined up. */
function listing(entries: readonly Entry[], indent = '    '): string[] {
  const countWidth = entries.reduce(
    (widest, entry) => Math.max(widest, entry.count === undefined ? 0 : String(entry.count).length),
    0,
  );
  const prefix = countWidth === 0 ? indent : `${indent}${' '.repeat(countWidth + 2)}`;
  const textWidth = entries.reduce(
    (widest, entry) => Math.max(widest, truncate(entry.text).length),
    0,
  );

  return entries.map((entry) => {
    const counted =
      entry.count === undefined
        ? `${prefix}${truncate(entry.text)}`
        : `${indent}${String(entry.count).padStart(countWidth)}  ${truncate(entry.text)}`;
    if (entry.where === undefined) {
      return counted;
    }
    return `${counted.padEnd(prefix.length + textWidth)}  ${style.gray(entry.where)}`;
  });
}

function more(hidden: number, singular: string): string[] {
  return hidden === 0 ? [] : [style.gray(`    ${andMore(hidden, singular)}`)];
}

function stepLines(entries: readonly StepEntry[], counted = true): string[] {
  return listing(
    entries.map((entry) => ({
      ...(counted ? {count: entry.count} : {}),
      text: entry.text,
      where: location(entry.file, entry.line),
    })),
  );
}

function similarLines(groups: readonly SimilarGroup[]): string[] {
  return groups.flatMap((group, index) => [...(index === 0 ? [] : ['']), ...stepLines(group.members)]);
}

/** The report, as a block of text. */
export function toText(statistics: Statistics, options: StatsFormatOptions): string {
  const {files, inventory, scenarios, steps, tags, languages} = statistics;

  if (files.total === 0) {
    return 'No feature files found.';
  }

  const counted =
    files.unreadable.length === 0
      ? plural(files.parsed, 'file')
      : `${files.parsed} of ${plural(files.total, 'file')}`;

  const lines: string[] = [
    [counted, plural(inventory.features, 'feature'), plural(scenarios.effective, 'test case')].join(
      ', ',
    ),
  ];

  lines.push('', 'Inventory', ...block([
    {label: 'Features', value: String(inventory.features)},
    {label: 'Rules', value: String(inventory.rules)},
    {label: 'Backgrounds', value: String(inventory.backgrounds)},
    {label: 'Scenarios', value: String(inventory.scenarios)},
    {label: 'Scenario Outlines', value: String(inventory.scenarioOutlines)},
    {
      label: 'Examples tables',
      value: String(inventory.examplesTables),
      note: plural(inventory.examplesRows, 'row'),
    },
    {label: 'Steps', value: String(inventory.steps), note: 'as written'},
    {label: 'Data tables', value: String(inventory.dataTables)},
    {label: 'Doc strings', value: String(inventory.docStrings)},
  ]));

  const largest = head(scenarios.largest, options.top);
  lines.push('', 'Scenarios', ...block([
    {
      label: 'Test cases',
      value: String(scenarios.effective),
      note: 'one per Scenario, one per Examples row',
    },
    {
      label: 'Steps per scenario',
      value: summarise(scenarios.stepsPerScenario),
      note: 'Background steps excluded',
      wide: true,
    },
  ]));
  if (largest.shown.length > 0) {
    lines.push(
      '',
      '  Longest',
      ...listing(
        largest.shown.map((scenario) => ({
          count: scenario.steps,
          text: scenario.name === '' ? '(unnamed)' : scenario.name,
          where: location(scenario.file, scenario.line),
        })),
      ),
      ...more(largest.hidden, 'scenario'),
    );
  }

  const {given, when, then, other} = steps.keywords;
  const mix = [
    `Given ${given} (${percent(given, steps.total)})`,
    `When ${when} (${percent(when, steps.total)})`,
    `Then ${then} (${percent(then, steps.total)})`,
    ...(other === 0 ? [] : [`unresolved ${other}`]),
  ].join('   ');

  lines.push('', 'Steps', ...block([
    {label: 'Written', value: String(steps.total), note: 'Background steps included'},
    {
      label: 'Distinct',
      value: String(steps.unique),
      note: `${percent(steps.unique, steps.total)} of all steps - lower is more reuse`,
    },
    {
      label: 'Written once',
      value: String(steps.usedOnce),
      note: `${percent(steps.usedOnce, steps.unique)} of distinct steps`,
    },
    {label: 'Words per step', value: summarise(steps.wordsPerStep), wide: true},
    {
      label: 'Keywords',
      value: mix,
      note: 'And and But resolved to what they follow',
      wide: true,
    },
  ]));

  const mostUsed = head(
    steps.vocabulary.filter((entry) => entry.count > 1),
    options.top,
  );
  if (mostUsed.shown.length > 0) {
    lines.push('', '  Most used', ...stepLines(mostUsed.shown), ...more(mostUsed.hidden, 'step'));
  }

  const once = head(
    [...steps.vocabulary].filter((entry) => entry.count === 1).sort((a, b) => (a.text < b.text ? -1 : 1)),
    options.top,
  );
  if (once.shown.length > 0) {
    lines.push(
      '',
      '  Written once',
      ...stepLines(once.shown, false),
      ...more(once.hidden, 'step'),
    );
  }

  const similar = head(steps.similar, options.top);
  if (similar.shown.length > 0) {
    lines.push(
      '',
      `  Nearly the same (${plural(steps.similar.length, 'group')})`,
      ...similarLines(similar.shown),
      ...more(similar.hidden, 'group'),
    );
  }

  const untagged = inventory.scenarios + inventory.scenarioOutlines;
  lines.push('', 'Tags', ...block([
    {label: 'Written', value: String(tags.total)},
    {label: 'Distinct', value: String(tags.unique)},
    {
      label: 'Written once',
      value: String(tags.usedOnce.length),
      note: tags.usedOnce.length === 0 ? undefined : 'a tag written once is often a typo of one written often',
    },
    {
      label: 'Untagged scenarios',
      value: String(tags.untaggedScenarios),
      note: `${percent(tags.untaggedScenarios, untagged)} of scenarios, counting inherited tags`,
    },
  ]));

  const tagsUsed = head(tags.vocabulary.filter((entry) => entry.count > 1), options.top);
  if (tagsUsed.shown.length > 0) {
    lines.push(
      '',
      '  Most used',
      ...listing(tagsUsed.shown.map((tag) => ({count: tag.count, text: tag.name}))),
      ...more(tagsUsed.hidden, 'tag'),
    );
  }

  const tagsOnce = head(tags.usedOnce, options.top);
  if (tagsOnce.shown.length > 0) {
    lines.push('', '  Written once', `    ${tagsOnce.shown.join(', ')}`, ...more(tagsOnce.hidden, 'tag'));
  }

  if (languages.length > 1) {
    lines.push(
      '',
      'Languages',
      ...block(
        languages.map((language) => ({
          label: language.code,
          value: String(language.files),
          note: language.files === 1 ? 'file' : 'files',
        })),
      ),
    );
  }

  if (files.unreadable.length > 0) {
    const unreadable = head(files.unreadable, options.top);
    lines.push(
      '',
      `Could not be read (${plural(files.unreadable.length, 'file')}, not counted above)`,
      ...unreadable.shown.map(
        (file) => `    ${location(file.file, file.line)}  ${style.gray(file.reason)}`,
      ),
      ...more(unreadable.hidden, 'file'),
    );
  }

  return lines.join('\n');
}
