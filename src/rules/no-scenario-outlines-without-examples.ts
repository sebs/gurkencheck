import {getNodeType} from '../gherkin/keywords.ts';
import {scenariosOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';

const name = 'no-scenario-outlines-without-examples';

const rule: LintRule = {
  name,
  run(feature) {
    if (feature === undefined) {
      return [];
    }

    const errors: RuleError[] = [];

    for (const {scenario} of scenariosOf(feature)) {
      if (getNodeType(scenario, feature.language) !== 'Scenario Outline') {
        continue;
      }
      const hasRows = scenario.examples.some((examples) => examples.tableBody.length > 0);
      if (!hasRows) {
        errors.push({
          message: 'Scenario Outline does not have any Examples',
          rule: name,
          line: scenario.location.line,
        });
      }
    }

    return errors;
  },
};

export default rule;
