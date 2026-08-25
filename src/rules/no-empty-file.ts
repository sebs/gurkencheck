import type {LintRule} from '../types.ts';

const name = 'no-empty-file';

const rule: LintRule = {
  name,
  run(feature) {
    if (feature !== undefined) {
      return [];
    }
    return [{message: 'Empty feature files are disallowed', rule: name, line: 1}];
  },
};

export default rule;
