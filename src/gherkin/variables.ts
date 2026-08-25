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

/** `<name>` placeholders, as used in Scenario Outlines. */
const VARIABLE = /<([^>]*)>/gu;

/** Where a variable was seen: the node holding it. */
export interface Position {
  line: number;
  column?: number;
}

/** Variable name -> every place it appears. */
export type Sightings = Map<string, Position[]>;

/** What a Scenario Outline declares, and what it actually uses. */
export interface ScenarioVariables {
  /** Column names, against the Examples header cells declaring them. */
  declared: Sightings;
  /** Variable names, against every node using them. */
  used: Sightings;
}

function note(variable: string, position: Position, into: Sightings): void {
  const seen = into.get(variable);
  if (seen === undefined) {
    into.set(variable, [position]);
    return;
  }
  const already = seen.some((p) => p.line === position.line && p.column === position.column);
  if (!already) {
    seen.push(position);
  }
}

/** Records every `<variable>` in `text` against the node holding it. */
function collect(text: string | undefined, position: Position, into: Sightings): void {
  if (text === undefined || text === '') {
    return;
  }
  for (const match of text.matchAll(VARIABLE)) {
    note(match[1]!, position, into);
  }
}

/** Gathers the variables a Scenario Outline declares and the ones it uses. */
export function variablesOf(scenario: Scenario): ScenarioVariables {
  const declared: Sightings = new Map();
  const used: Sightings = new Map();

  for (const examples of scenario.examples) {
    for (const cell of examples.tableHeader?.cells ?? []) {
      if (cell.value !== '') {
        note(cell.value, at(cell.location), declared);
      }
    }
  }

  collect(scenario.name, at(scenario.location), used);

  for (const step of scenario.steps) {
    collect(step.text, at(step.location), used);

    // Steps can carry a data table or a doc string, and both may contain
    // variables. See https://cucumber.io/docs/gherkin/reference/
    for (const row of step.dataTable?.rows ?? []) {
      for (const cell of row.cells) {
        collect(cell.value, at(cell.location), used);
      }
    }
    if (step.docString !== undefined) {
      collect(step.docString.content, at(step.location), used);
    }
  }

  return {declared, used};
}
