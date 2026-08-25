// A custom rule that has to wait for something before it can answer, the way
// a rule checking tags against an issue tracker would.
const name = 'slow-custom';

export default {
  name,
  async run(feature) {
    const names = await Promise.resolve(
      (feature?.children ?? [])
        .filter((child) => child.scenario !== undefined)
        .map((child) => child.scenario),
    );

    return names.map((scenario) => ({
      message: `Checked "${scenario.name}" after waiting`,
      rule: name,
      line: scenario.location.line,
    }));
  },
};
