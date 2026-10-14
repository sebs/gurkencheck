import {variablesOf} from '../gherkin/variables.ts';
import {scenariosOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';

const name = 'no-undeclared-variables';

const rule: LintRule = {
  name,
  run(feature, file) {
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

      const {declared, tables, used} = variablesOf(scenario, file.lines);

      for (const [variable, positions] of used) {
        // Declared nowhere is one mistake; declared in some tables but not
        // all is another, and the table leaving it out is worth naming.
        const missingFrom = !declared.has(variable)
          ? ['the examples table']
          : tables
              .filter((table) => !table.columns.has(variable))
              .map((table) => `the examples table on line ${table.line}`);

        for (const table of missingFrom) {
          for (const {in: where = 'step', ...position} of positions) {
            // What holds it is named: a variable in the Outline's name is
            // not a step variable.
            const holder = where === 'step' ? 'Step' : `${where.charAt(0).toUpperCase()}${where.slice(1)}`;
            errors.push({
              message: `${holder} variable "${variable}" does not exist in ${table}`,
              rule: name,
              ...position,
            });
          }
        }
      }
    }

    return errors;
  },
};

export default rule;
