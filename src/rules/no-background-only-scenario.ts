import type {LintRule, RuleError} from '../types.ts';

const name = 'no-background-only-scenario';

const rule: LintRule = {
  name,
  run(feature) {
    const children = feature?.children ?? [];
    const errors: RuleError[] = [];

    for (const child of children) {
      // Only one Background is allowed per file, so a Feature needs at least
      // three children before it has more than one Scenario alongside it.
      if (child.background !== undefined && children.length <= 2) {
        errors.push({
          message: 'Backgrounds are not allowed when there is just one scenario.',
          rule: name,
          line: child.background.location.line,
        });
      }
    }
    return errors;
  },
};

export default rule;
