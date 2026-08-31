import {scenariosOf} from '../gherkin/traverse.ts';
import type {LintRule, RunFinding} from '../types.ts';
import {at} from '../util/location.ts';

const name = 'no-dupe-scenario-names';

/** Whether duplicates are looked for across all files or within each file. */
const availableConfigs = ['anywhere', 'in-feature'] as const;

/** Where one scenario name was seen. */
interface Sighting {
  filePath: string;
  at: {line: number; column?: number};
}

/** Scenario name -> everywhere it was seen. */
type Seen = Map<string, Sighting[]>;

const rule: LintRule = {
  name,
  availableConfigs,
  run(feature, file, configuration, context) {
    if (feature === undefined) {
      return [];
    }

    const seen = context.state<Seen>(() => new Map());
    const withinOneFile = configuration === 'in-feature';

    for (const {scenario} of scenariosOf(feature)) {
      // Told to look within each file, a name only clashes with the same name
      // in the same file - so which file it is in is part of what makes a
      // name that name. A newline cannot appear in either half, so the two
      // cannot run together into a key that means something else.
      const key = withinOneFile ? `${file.relativePath}\n${scenario.name}` : scenario.name;
      const sightings = seen.get(key) ?? [];
      sightings.push({filePath: file.relativePath, at: at(scenario.location)});
      seen.set(key, sightings);
    }

    return [];
  },
  onRunEnd(_configuration, context) {
    const seen = context.state<Seen>(() => new Map());
    const findings: RunFinding[] = [];

    for (const sightings of seen.values()) {
      if (sightings.length < 2) {
        continue;
      }
      // Every scenario in the group hears about the others, so renaming can
      // start from whichever one is easiest to change.
      for (const sighting of sightings) {
        const others = sightings.filter((other) => other !== sighting);
        const where = others
          .map((other) => `${other.filePath}:${other.at.line}`)
          .join(', ');
        findings.push({
          message: `Scenario name is also used in: ${where}`,
          rule: name,
          ...sighting.at,
          filePath: sighting.filePath,
        });
      }
    }

    return findings;
  },
};

export default rule;
