import {scenariosOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';

const name = 'no-unused-variables';

/** `<name>` placeholders, as used in Scenario Outlines. */
const VARIABLE = /<([^>]*)>/gu;

/** Variable name -> every line it appears on. */
type Sightings = Map<string, Set<number>>;

function note(variable: string, line: number, into: Sightings): void {
  const lines = into.get(variable);
  if (lines === undefined) {
    into.set(variable, new Set([line]));
  } else {
    lines.add(line);
  }
}

/** Records every `<variable>` in `text` against the line it appears on. */
function collect(text: string | undefined, line: number, into: Sightings): void {
  if (text === undefined || text === '') {
    return;
  }
  for (const match of text.matchAll(VARIABLE)) {
    note(match[1]!, line, into);
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

      /** Column names, against the Examples header lines declaring them. */
      const declared: Sightings = new Map();
      /** Variable names, against every line using them. */
      const used: Sightings = new Map();

      for (const examples of scenario.examples) {
        for (const cell of examples.tableHeader?.cells ?? []) {
          if (cell.value !== '') {
            note(cell.value, cell.location.line, declared);
          }
        }
      }

      collect(scenario.name, scenario.location.line, used);

      for (const step of scenario.steps) {
        collect(step.text, step.location.line, used);

        // Steps can carry a data table or a doc string, and both may contain
        // variables. See https://cucumber.io/docs/gherkin/reference/
        for (const row of step.dataTable?.rows ?? []) {
          for (const cell of row.cells) {
            collect(cell.value, cell.location.line, used);
          }
        }
        if (step.docString !== undefined) {
          collect(step.docString.content, step.location.line, used);
        }
      }

      // Every place a problem appears is reported, not just the last one, so
      // that fixing the file does not turn into a game of whack-a-mole.
      for (const [variable, lines] of declared) {
        if (used.has(variable)) {
          continue;
        }
        for (const line of lines) {
          errors.push({
            message: `Examples table variable "${variable}" is not used in any step`,
            rule: name,
            line,
          });
        }
      }

      for (const [variable, lines] of used) {
        if (declared.has(variable)) {
          continue;
        }
        for (const line of lines) {
          errors.push({
            message: `Step variable "${variable}" does not exist in the examples table`,
            rule: name,
            line,
          });
        }
      }
    }

    return errors;
  },
};

export default rule;
