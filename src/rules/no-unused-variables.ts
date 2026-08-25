import {scenariosOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';
import {at} from '../util/location.ts';

const name = 'no-unused-variables';

/** `<name>` placeholders, as used in Scenario Outlines. */
const VARIABLE = /<([^>]*)>/gu;

/** Where a variable was seen: the node holding it. */
type Position = {line: number; column?: number};

/** Variable name -> every place it appears. */
type Sightings = Map<string, Position[]>;

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

const rule: LintRule = {
  name,
  run(feature) {
    if (feature === undefined) {
      return [];
    }

    const errors: RuleError[] = [];

    for (const {scenario} of scenariosOf(feature)) {
      // Without an Examples table there is nothing for variables to refer to.
      if (scenario.examples.length === 0) {
        continue;
      }

      /** Column names, against the Examples header cells declaring them. */
      const declared: Sightings = new Map();
      /** Variable names, against every node using them. */
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

      // Every place a problem appears is reported, not just the last one, so
      // that fixing the file does not turn into a game of whack-a-mole.
      for (const [variable, positions] of declared) {
        if (used.has(variable)) {
          continue;
        }
        for (const position of positions) {
          errors.push({
            message: `Examples table variable "${variable}" is not used in any step`,
            rule: name,
            ...position,
          });
        }
      }

      for (const [variable, positions] of used) {
        if (declared.has(variable)) {
          continue;
        }
        for (const position of positions) {
          errors.push({
            message: `Step variable "${variable}" does not exist in the examples table`,
            rule: name,
            ...position,
          });
        }
      }
    }

    return errors;
  },
};

export default rule;
