/**
 * Checking settings that hold regular expressions, before any file is read.
 */

/**
 * What is wrong with the patterns of one setting, one entry per pattern that
 * is not a regular expression. Found here, it is one message about the
 * configuration; found while linting, it would be one per file.
 */
export function invalidPatterns(setting: string, patterns: unknown, flags = ''): string[] {
  const problems: string[] = [];
  for (const pattern of Array.isArray(patterns) ? patterns : []) {
    try {
      compilePattern(String(pattern), flags);
    } catch (thrown) {
      const reason = thrown instanceof Error ? thrown.message : String(thrown);
      problems.push(`"${setting}" holds ${JSON.stringify(pattern)}, which is not a regular expression: ${reason}`);
    }
  }
  return problems;
}

/**
 * A setting's pattern as a regular expression, read with the `u` flag
 * wherever it can be.
 *
 * Without it, `\p{Lu}` is a literal `p{Lu}` and `.` matches half an emoji, so
 * a pattern meant to ban something lets it through without a word. A pattern
 * written for the old reading that `u` refuses, such as `@wip\-`, is still
 * read the old way rather than breaking a configuration that worked.
 */
export function compilePattern(pattern: string, flags = ''): RegExp {
  try {
    return new RegExp(pattern, `${flags}u`);
  } catch {
    return new RegExp(pattern, flags);
  }
}
