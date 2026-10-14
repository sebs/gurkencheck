/**
 * Access to Gherkin's localised keywords.
 */
import {dialects} from '@cucumber/gherkin';

/** The keyword lists for one language. */
export interface Dialect {
  name: string;
  native: string;
  feature: readonly string[];
  rule: readonly string[];
  background: readonly string[];
  scenario: readonly string[];
  scenarioOutline: readonly string[];
  examples: readonly string[];
  given: readonly string[];
  when: readonly string[];
  then: readonly string[];
  and: readonly string[];
  but: readonly string[];
}

const ALL_DIALECTS = dialects as unknown as Record<string, Dialect>;

export const DEFAULT_LANGUAGE = 'en';

/** The dialect for a language code, falling back to English. */
export function getDialect(language: string | undefined): Dialect {
  const code = language ?? DEFAULT_LANGUAGE;
  return isKnownLanguage(code) ? ALL_DIALECTS[code]! : ALL_DIALECTS[DEFAULT_LANGUAGE]!;
}

/**
 * True when `language` is one Gherkin knows about.
 *
 * Only the table's own entries count: `constructor`, `__proto__` and
 * `toString` are found on any object, and taken for dialects they got past
 * this check and broke every file read in them.
 */
export function isKnownLanguage(language: string): boolean {
  return Object.hasOwn(ALL_DIALECTS, language);
}

/**
 * The language code meant by one Gherkin does not know, if there is one:
 * `DE` for `de`, `zh-cn` for `zh-CN`, or `en-US` and `de_DE` for the
 * language the region belongs to. Gherkin reads codes exactly, so this is
 * only ever offered, never taken in their place.
 */
export function suggestLanguage(language: string): string | undefined {
  const codes = Object.keys(ALL_DIALECTS);
  const wanted = language.toLowerCase().replace(/_/gu, '-');
  return (
    codes.find((code) => code.toLowerCase() === wanted) ??
    codes.find((code) => code.toLowerCase() === wanted.split('-')[0])
  );
}

/** `Unknown language "DE". Did you mean "de"?`, or the general hint. */
export function unknownLanguageMessage(language: string, from = ''): string {
  const suggestion = suggestLanguage(language);
  return suggestion === undefined
    ? `Unknown language "${language}"${from}. Use a Gherkin language code, such as "fr".`
    : `Unknown language "${language}"${from}. Did you mean "${suggestion}"?`;
}

const LANGUAGE_HEADER = /^\s*#\s*language\s*:\s*([\w-]+)\s*$/;

/**
 * The `# language: xx` header at the top of a feature file, and the line it is
 * on, whether or not Gherkin knows the language. Only the leading comment and
 * blank lines are inspected, which is where Gherkin itself expects the header
 * to be.
 */
export function languageHeader(
  lines: readonly string[],
): {language: string; line: number} | undefined {
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed === '') {
      continue;
    }
    if (!trimmed.startsWith('#')) {
      break;
    }
    const header = LANGUAGE_HEADER.exec(trimmed);
    if (header?.[1] !== undefined) {
      return {language: header[1], line: index + 1};
    }
  }
  return undefined;
}

/**
 * The language a feature file is read in: the one its `# language: xx`
 * header names, when Gherkin knows it.
 *
 * A file with no header is read in `fallback`, which lets a project written
 * entirely in one language set it once instead of in every file.
 */
export function detectLanguage(
  lines: readonly string[],
  fallback: string = DEFAULT_LANGUAGE,
): string {
  const header = languageHeader(lines);
  if (header !== undefined && isKnownLanguage(header.language)) {
    return header.language;
  }
  return isKnownLanguage(fallback) ? fallback : DEFAULT_LANGUAGE;
}
