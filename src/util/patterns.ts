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

/**
 * What is wrong with a list of tag names, one entry per name that is not a
 * tag. Gherkin's tags start with `@`, and one listed without it - `wip` - can
 * never be matched, so a ban on it bans nothing and an allowance for it
 * allows nothing.
 */
export function invalidTagNames(setting: string, tags: unknown): string[] {
  return (Array.isArray(tags) ? tags : [])
    .filter((tag) => typeof tag === 'string' && !tag.startsWith('@'))
    .map((tag) => `"${setting}" holds "${String(tag)}", which is not a tag: write it as "@${String(tag)}"`);
}
