import {scenariosOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';

const name = 'no-unused-variables';

/** `<name>` placeholders, as used in Scenario Outlines. */
const VARIABLE = /<([^>]*)>/gu;

/** Records every `<variable>` in `text` against the line it appears on. */
function collect(text: string | undefined, line: number, into: Map<string, number>): void {
  if (text === undefined || text === '') {
    return;
  }
  for (const match of text.matchAll(VARIABLE)) {
    into.set(match[1]!, line);
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

      /** Column name -> line of the Examples table header. */
      const declared = new Map<string, number>();
      /** Variable name -> line where it is used. */
      const used = new Map<string, number>();

      for (const examples of scenario.examples) {
        for (const cell of examples.tableHeader?.cells ?? []) {
          if (cell.value !== '') {
            declared.set(cell.value, cell.location.line);
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

      for (const [variable, line] of declared) {
        if (!used.has(variable)) {
          errors.push({
            message: `Examples table variable "${variable}" is not used in any step`,
            rule: name,
            line,
          });
        }
      }

      for (const [variable, line] of used) {
        if (!declared.has(variable)) {
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
