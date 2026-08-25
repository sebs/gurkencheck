import type {Feature, Rule as GherkinRule} from '@cucumber/messages';
import {backgroundsOf, scenariosOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';

const name = 'no-background-only-scenario';

/**
 * How many scenarios a Background applies to.
 *
 * A Background written inside a Rule covers that Rule's scenarios. One
 * written at Feature level covers every scenario in the file, including
 * those inside Rules.
 */
function scenariosCovered(feature: Feature, containingRule: GherkinRule | undefined): number {
  let count = 0;
  for (const {rule} of scenariosOf(feature)) {
    if (containingRule === undefined || rule === containingRule) {
      count++;
    }
  }
  return count;
}

const rule: LintRule = {
  name,
  run(feature) {
    if (feature === undefined) {
      return [];
    }

    const errors: RuleError[] = [];

    for (const {background, rule: containingRule} of backgroundsOf(feature)) {
      // A Background exists to share setup between scenarios. With exactly one
      // there is nothing to share. With none at all there is nothing to report
      // here either - that is what no-files-without-scenarios is for.
      if (scenariosCovered(feature, containingRule) === 1) {
        errors.push({
          message: 'Backgrounds are not allowed when there is just one scenario.',
          rule: name,
          line: background.location.line,
        });
      }
    }

    return errors;
  },
};

export default rule;
