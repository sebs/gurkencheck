import type {Scenario} from '@cucumber/messages';
import {scenariosOf} from '../gherkin/traverse.ts';
import type {LintRule, RunFinding} from '../types.ts';
import {listSome} from '../util/collections.ts';
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

/**
 * The names a scenario has in a report. Cucumber fills an Outline's
 * placeholders in from each row of its Examples, so `Buy <count>` with a row
 * of 1 is reported as `Buy 1` - and clashes with a Scenario called that - while
 * two rows filling it the same are two tests of one name. Each such name is
 * placed at the row it comes from.
 */
function namesInReports(scenario: Scenario): {name: string; location: {line: number; column?: number}}[] {
  const rows = scenario.examples.flatMap((examples) =>
    (examples.tableBody ?? []).map((row) => ({header: examples.tableHeader, row})),
  );
  if (!/<[^<>]+>/u.test(scenario.name) || rows.length === 0) {
    return [{name: scenario.name, location: at(scenario.location)}];
  }
  return rows.map(({header, row}) => {
    let name = scenario.name;
    header?.cells.forEach((cell, index) => {
      name = name.split(`<${cell.value}>`).join(row.cells[index]?.value ?? '');
    });
    return {name, location: at(row.location)};
  });
}

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
      // A scenario with no name is no-unnamed-scenarios' finding, not a clash.
      if (scenario.name.trim() === '') {
        continue;
      }
      for (const {name: shown, location} of namesInReports(scenario)) {
        // Told to look within each file, a name only clashes with the same
        // name in the same file - so which file it is in is part of what
        // makes a name that name. A newline cannot appear in either half, so
        // the two cannot run together into a key that means something else.
        const key = withinOneFile ? `${file.relativePath}\n${shown}` : shown;
        const sightings = seen.get(key) ?? [];
        sightings.push({filePath: file.relativePath, at: location});
        seen.set(key, sightings);
      }
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
        const where = listSome(others.map((other) => `${other.filePath}:${other.at.line}`));
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
