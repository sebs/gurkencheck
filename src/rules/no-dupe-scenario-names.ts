import {scenariosOf} from '../gherkin/traverse.ts';
import type {LintRule, RuleError} from '../types.ts';

const name = 'no-dupe-scenario-names';

/** Whether duplicates are looked for across all files or within each file. */
const availableConfigs = ['anywhere', 'in-feature'] as const;

interface Sighting {
  file: string;
  line: number;
}

/** Scenario name -> everywhere it has already been seen. */
const seen = new Map<string, Sighting[]>();

const rule: LintRule = {
  name,
  availableConfigs,
  reset() {
    seen.clear();
  },
  run(feature, file, configuration) {
    if (feature === undefined) {
      return [];
    }
    if (configuration === 'in-feature') {
      seen.clear();
    }

    const errors: RuleError[] = [];

    for (const {scenario} of scenariosOf(feature)) {
      const sighting: Sighting = {file: file.relativePath, line: scenario.location.line};
      const previous = seen.get(scenario.name);

      if (previous === undefined) {
        seen.set(scenario.name, [sighting]);
        continue;
      }

      const where = previous.map((seenAt) => `${seenAt.file}:${seenAt.line}`).join(', ');
      previous.push(sighting);
      errors.push({
        message: `Scenario name is already used in: ${where}`,
        rule: name,
        line: scenario.location.line,
      });
    }

    return errors;
  },
};

export default rule;
