import type {LintRule} from '../types.ts';

const name = 'no-unnamed-features';

const rule: LintRule = {
  name,
  run(feature) {
    if (feature !== undefined && feature.name !== '') {
      return [];
    }
    return [
      {
        message: 'Missing Feature name',
        rule: name,
        line: feature?.location.line ?? 0,
      },
    ];
  },
};

export default rule;
