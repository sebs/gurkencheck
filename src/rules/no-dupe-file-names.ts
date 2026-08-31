import path from 'node:path';
import type {LintRule, RunFinding} from '../types.ts';

const name = 'no-dupe-file-names';

/**
 * Two feature files with the same name in different folders are easy to
 * confuse, and tools that write one report per feature - naming it after the
 * file - quietly overwrite one with the other.
 */

/** File name without its extension -> every path it was seen at. */
type Seen = Map<string, string[]>;

const rule: LintRule = {
  name,
  run(_feature, file, _configuration, context) {
    const seen = context.state<Seen>(() => new Map());
    const fileName = path.basename(file.relativePath, path.extname(file.relativePath));
    const paths = seen.get(fileName);

    if (paths === undefined) {
      seen.set(fileName, [file.relativePath]);
    } else if (!paths.includes(file.relativePath)) {
      // A file handed to the linter twice is the caller repeating itself, not
      // two files sharing a name.
      paths.push(file.relativePath);
    }

    return [];
  },
  onRunEnd(_configuration, context) {
    const seen = context.state<Seen>(() => new Map());
    const findings: RunFinding[] = [];

    for (const paths of seen.values()) {
      if (paths.length < 2) {
        continue;
      }
      // Every file involved hears about every other. Which of them was read
      // first is an accident of the order the files came in, so blaming that
      // one alone says more about the run than about the files.
      for (const filePath of paths) {
        const others = paths.filter((other) => other !== filePath);
        findings.push({
          message: `File name is also used in: ${others.join(', ')}`,
          rule: name,
          line: 0,
          filePath,
        });
      }
    }

    return findings;
  },
};

export default rule;
