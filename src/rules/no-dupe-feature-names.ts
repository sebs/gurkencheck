import type {LintRule} from '../types.ts';

const name = 'no-dupe-feature-names';

/** Feature name -> the files it has already been seen in. */
const seen = new Map<string, string[]>();

const rule: LintRule = {
  name,
  reset() {
    seen.clear();
  },
  run(feature, file) {
    if (feature === undefined) {
      return [];
    }

    const previous = seen.get(feature.name);
    if (previous === undefined) {
      seen.set(feature.name, [file.relativePath]);
      return [];
    }

    const message = `Feature name is already used in: ${previous.join(', ')}`;
    previous.push(file.relativePath);
    return [{message, rule: name, line: feature.location.line}];
  },
};

export default rule;
