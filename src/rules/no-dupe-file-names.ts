import path from 'node:path';
import type {LintRule} from '../types.ts';

const name = 'no-dupe-file-names';

/**
 * Two feature files with the same name in different folders are easy to
 * confuse, and tools that write one report per feature - naming it after the
 * file - quietly overwrite one with the other.
 */

/** File name without its extension -> the paths it has already been seen at. */
const seen = new Map<string, string[]>();

const rule: LintRule = {
  name,
  reset() {
    seen.clear();
  },
  run(_feature, file) {
    const fileName = path.basename(file.relativePath, path.extname(file.relativePath));
    const previous = seen.get(fileName);

    if (previous === undefined) {
      seen.set(fileName, [file.relativePath]);
      return [];
    }

    const message = `File name is already used in: ${previous.join(', ')}`;
    previous.push(file.relativePath);
    return [{message, rule: name, line: 0}];
  },
};

export default rule;
