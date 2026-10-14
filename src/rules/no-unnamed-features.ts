import type {LintRule} from '../types.ts';
import {at} from '../util/location.ts';

const name = 'no-unnamed-features';

const rule: LintRule = {
  name,
  run(feature) {
    // A file with no Feature at all has nothing to name: that is
    // no-empty-file's finding, and reporting it here as well counted one
    // empty file as two errors.
    if (feature === undefined || feature.name.trim() !== '') {
      return [];
    }
    return [{message: 'Missing Feature name', rule: name, ...at(feature.location)}];
  },
};

export default rule;
