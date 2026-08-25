import type {LintRule} from '../types.ts';
import {at} from '../util/location.ts';

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
        ...(feature === undefined ? {line: 0} : at(feature.location)),
      },
    ];
  },
};

export default rule;
