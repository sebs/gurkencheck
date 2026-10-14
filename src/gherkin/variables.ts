/**
 * Finding the `<placeholder>` variables of a Scenario Outline.
 *
 * A Scenario Outline declares its variables as the columns of an Examples
 * table, and uses them in step text, step arguments and its own name. Two
 * rules care about the difference between the two sets, so the gathering is
 * done once here.
 */
import type {Scenario} from '@cucumber/messages';
import {at} from '../util/location.ts';

/**
 * `<name>` placeholders, as used in Scenario Outlines.
 *
 * Cucumber substitutes any column name written in angle brackets, so what
 * counts as one here is only what could be a column name: not starting or
 * ending with a space or `/`, and holding no quotes or `=`. Without that,
 * `x < 5 and y > 3`, `<div class="x">` and `<br/>` would read as variables.
 */
const VARIABLE = /<([^<>\s"'=/](?:[^<>\n"'=]*[^<>\s"'=/])?)>/gu;

/** Where a variable was seen. */
export interface Position {
  line: number;
  column?: number;
  /** What holds it, as a message would put it: `step`, `Scenario Outline name`. */
  in?: string;
}

/** Variable name -> every place it appears. */
export type Sightings = Map<string, Position[]>;

/** The columns one Examples table declares. */
export interface ExamplesTable {
  /** The line of the `Examples:` keyword. */
  line: number;
  columns: Set<string>;
}

/** What a Scenario Outline declares, and what it actually uses. */
export interface ScenarioVariables {
  /** Column names, against the Examples header cells declaring them. */
  declared: Sightings;
  /**
   * Each Examples table with a header, on its own. Cucumber runs the rows of
   * each table separately, so a variable has to be declared in every one of
   * them, not merely in one.
   */
  tables: ExamplesTable[];
  /** Variable names, against every node using them. */
  used: Sightings;
}

function note(variable: string, position: Position, into: Sightings): void {
  const seen = into.get(variable);
  if (seen === undefined) {
    into.set(variable, [position]);
    return;
  }
  const already = seen.some((p) => p.line === position.line && p.column === position.column && p.in === position.in);
  if (!already) {
    seen.push(position);
  }
}

/**
 * Records every `<variable>` in `text`, which starts at `start` in the file,
 * at the column of the variable itself. Columns count characters, as Gherkin
 * counts them, not UTF-16 units.
 */
function collect(
  text: string | undefined,
  start: Position,
  into: Sightings,
  unusualColumns: readonly string[] = [],
): void {
  if (text === undefined || text === '') {
    return;
  }
  const positionAt = (index: number): Position => {
    const offset = [...text.slice(0, index)].length;
    return {...start, ...(start.column === undefined ? {} : {column: start.column + offset})};
  };
  for (const match of text.matchAll(VARIABLE)) {
    note(match[1]!, positionAt(match.index), into);
  }
  // A column whose name holds a quote or = is filled in by Cucumber all the
  // same, but is not placeholder-shaped, so its <name> is looked for as it is.
  for (const column of unusualColumns) {
    for (let index = text.indexOf(`<${column}>`); index !== -1; index = text.indexOf(`<${column}>`, index + 1)) {
      note(column, positionAt(index), into);
    }
  }
}

/** True when `<name>` reads as a variable to VARIABLE. */
function isPlaceholderShaped(name: string): boolean {
  return new RegExp(`^${VARIABLE.source}$`, 'u').test(`<${name}>`);
}

/** The column `text` starts at on `line`, or `fallback` when it is not there. */
function columnOf(line: string | undefined, text: string, fallback: number | undefined): number | undefined {
  const index = line?.indexOf(text) ?? -1;
  return index === -1 ? fallback : [...line!.slice(0, index)].length + 1;
}

/**
 * Gathers the variables a Scenario Outline declares and the ones it uses.
 * Given the file's lines, a variable in the Outline's name is placed exactly;
 * without them, at the keyword.
 */
export function variablesOf(scenario: Scenario, lines?: readonly string[]): ScenarioVariables {
  const declared: Sightings = new Map();
  const used: Sightings = new Map();
  const tables: ExamplesTable[] = [];

  for (const examples of scenario.examples) {
    if (examples.tableHeader === undefined) {
      continue;
    }
    const columns = new Set<string>();
    for (const cell of examples.tableHeader.cells) {
      if (cell.value !== '') {
        note(cell.value, at(cell.location), declared);
        columns.add(cell.value);
      }
    }
    tables.push({line: examples.location.line, columns});
  }

  const unusual = [...declared.keys()].filter((name) => !isPlaceholderShaped(name));

  const nameLine = scenario.location.line;
  collect(
    scenario.name,
    {
      line: nameLine,
      column: columnOf(lines?.[nameLine - 1], scenario.name, scenario.location.column),
      in: `${scenario.keyword} name`,
    },
    used,
    unusual,
  );

  for (const step of scenario.steps) {
    // The keyword holds the space after it, so the text starts right there.
    const textColumn = (step.location.column ?? 1) + [...step.keyword].length;
    collect(step.text, {line: step.location.line, column: textColumn, in: 'step'}, used, unusual);

    // Steps can carry a data table or a doc string, and both may contain
    // variables. See https://cucumber.io/docs/gherkin/reference/
    for (const row of step.dataTable?.rows ?? []) {
      for (const cell of row.cells) {
        collect(cell.value, {...at(cell.location), in: 'step'}, used, unusual);
      }
    }
    // A doc string's content starts on the line below its opening delimiter,
    // and each line of it is reported where it is.
    if (step.docString !== undefined) {
      const {content, location, mediaType, delimiter} = step.docString;
      // Cucumber fills in the content type too, as in """<format>.
      collect(
        mediaType,
        {line: location.line, column: (location.column ?? 1) + delimiter.length, in: 'step'},
        used,
        unusual,
      );
      content.split('\n').forEach((line, index) => {
        collect(line, {line: location.line + 1 + index, column: location.column, in: 'step'}, used, unusual);
      });
    }
  }

  return {declared, tables, used};
}
