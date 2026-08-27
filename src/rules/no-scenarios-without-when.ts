import {getNodeType, resolvedStepKeywords} from '../gherkin/keywords.ts';
import {backgroundsFor, scenariosOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';
import {mergeDefaults} from '../util/collections.ts';
import {at} from '../util/location.ts';

const name = 'no-scenarios-without-when';

const availableConfigs = {
  /**
   * Whether a `When` in a Background counts for the scenarios under it.
   *
   * On, because a Background's steps really do run before every scenario, so
   * a scenario relying on one is not missing anything. Turn it off if your
   * team wants each scenario to read as a whole on its own.
   */
  countBackground: true,
};

const rule: LintRule = {
  name,
  availableConfigs,
  run(feature, _file, configuration) {
    if (feature === undefined) {
      return [];
    }

    const {countBackground} = mergeDefaults(availableConfigs, configuration);
    const errors: RuleError[] = [];

    for (const {scenario, rule: containingRule} of scenariosOf(feature)) {
      // A scenario with no steps at all is a different mistake, and saying so
      // twice helps nobody.
      if (scenario.steps.length === 0) {
        continue;
      }

      const inherited = countBackground
        ? backgroundsFor(feature, containingRule).flatMap((background) => background.steps)
        : [];
      const keywords = [
        ...resolvedStepKeywords(inherited, feature.language),
        ...resolvedStepKeywords(scenario.steps, feature.language),
      ];

      if (!keywords.includes('when')) {
        errors.push({
          message: `${getNodeType(scenario, feature.language)} "${scenario.name}" does not have a When step`,
          rule: name,
          ...at(scenario.location),
        });
      }
    }

    return errors;
  },
};

export default rule;
