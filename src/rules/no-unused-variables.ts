import {variablesOf} from '../gherkin/variables.ts';
import {scenariosOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';

const name = 'no-unused-variables';

const rule: LintRule = {
  name,
  run(feature, file) {
    if (feature === undefined) {
      return [];
    }

    const errors: RuleError[] = [];

    for (const {scenario} of scenariosOf(feature)) {
      // Without an Examples table there is nothing to be unused.
      if (scenario.examples.length === 0) {
        continue;
      }

      const {declared, used} = variablesOf(scenario, file.lines);

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
    }

    return errors;
  },
};

export default rule;
