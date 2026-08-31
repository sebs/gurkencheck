import type {LintRule, RunFinding} from '../types.ts';
import {at} from '../util/location.ts';

const name = 'no-dupe-feature-names';

/** Where one feature name was seen. */
interface Sighting {
  filePath: string;
  at: {line: number; column?: number};
}

/** Feature name -> everywhere it was seen. */
type Seen = Map<string, Sighting[]>;

const rule: LintRule = {
  name,
  run(feature, file, _configuration, context) {
    if (feature === undefined) {
      return [];
    }

    const seen = context.state<Seen>(() => new Map());
    const sightings = seen.get(feature.name) ?? [];
    sightings.push({filePath: file.relativePath, at: at(feature.location)});
    seen.set(feature.name, sightings);

    return [];
  },
  onRunEnd(_configuration, context) {
    const seen = context.state<Seen>(() => new Map());
    const findings: RunFinding[] = [];

    for (const sightings of seen.values()) {
      if (sightings.length < 2) {
        continue;
      }
      // Each file hears about the others. Reporting only the later one made
      // the finding move when the files were given in a different order.
      for (const sighting of sightings) {
        const others = sightings.filter((other) => other !== sighting);
        findings.push({
          message: `Feature name is also used in: ${others.map((other) => other.filePath).join(', ')}`,
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
