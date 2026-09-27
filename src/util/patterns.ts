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
      new RegExp(String(pattern), flags);
    } catch (thrown) {
      const reason = thrown instanceof Error ? thrown.message : String(thrown);
      problems.push(`"${setting}" holds ${JSON.stringify(pattern)}, which is not a regular expression: ${reason}`);
    }
  }
  return problems;
}
