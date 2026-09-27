import {variablesOf} from '../gherkin/variables.ts';
import {scenariosOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';

const name = 'no-undeclared-variables';

const rule: LintRule = {
  name,
  run(feature) {
    if (feature === undefined) {
      return [];
    }

    const errors: RuleError[] = [];

    for (const {scenario} of scenariosOf(feature)) {
      // Without an Examples table there is nothing to declare a variable in,
      // and a <placeholder> is just text.
      if (scenario.examples.length === 0) {
        continue;
      }

      const {declared, tables, used} = variablesOf(scenario);

      for (const [variable, positions] of used) {
        // Declared nowhere is one mistake; declared in some tables but not
        // all is another, and the table leaving it out is worth naming.
        const messages = !declared.has(variable)
          ? [`Step variable "${variable}" does not exist in the examples table`]
          : tables
              .filter((table) => !table.columns.has(variable))
              .map(
                (table) =>
                  `Step variable "${variable}" does not exist in the examples table on line ${table.line}`,
              );

        for (const message of messages) {
          for (const position of positions) {
            errors.push({message, rule: name, ...position});
          }
        }
      }
    }

    return errors;
  },
};

export default rule;
