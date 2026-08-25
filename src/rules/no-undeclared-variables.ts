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

      const {declared, used} = variablesOf(scenario);

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
