/**
 * Checking settings that hold regular expressions, before any file is read.
 */
import {quoteValue} from './json.ts';

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
      problems.push(`"${setting}" holds ${quoteValue(pattern)}, which is not a regular expression: ${reason}`);
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
  } catch (thrown) {
    // A pattern naming a Unicode property was written for the u reading,
    // so a mistake in it - \p{Lux} - is a mistake, not the old reading: taken
    // the old way it would match the letters p{Lux}, and a ban would ban
    // nothing without a word.
    if (/\\[pP]\{/u.test(pattern)) {
      throw thrown;
    }
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
  const problems: string[] = [];
  for (const tag of Array.isArray(tags) ? tags : []) {
    if (typeof tag !== 'string' || /^@\S+$/u.test(tag)) {
      continue;
    }
    // A tag is @ and a name, with no space anywhere: Gherkin splits a tag
    // line on whitespace, so nothing else can ever be matched.
    const name = tag.trim().replace(/^@+/u, '');
    const meant = name === '' || /\s/u.test(name) ? undefined : `@${name}`;
    problems.push(
      meant === undefined
        ? `"${setting}" holds "${tag}", which is not a tag: a tag is @ followed by a name with no spaces`
        : `"${setting}" holds "${tag}", which is not a tag: write it as "${meant}"`,
    );
  }
  return problems;
}
