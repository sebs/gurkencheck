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
  return ALL_DIALECTS[language ?? DEFAULT_LANGUAGE] ?? ALL_DIALECTS[DEFAULT_LANGUAGE]!;
}

/** True when `language` is one Gherkin knows about. */
export function isKnownLanguage(language: string): boolean {
  return language in ALL_DIALECTS;
}

const LANGUAGE_HEADER = /^\s*#\s*language\s*:\s*([\w-]+)\s*$/;

/**
 * Reads the `# language: xx` header from the top of a feature file. Only the
 * leading comment and blank lines are inspected, which is where Gherkin
 * itself expects the header to be.
 */
export function detectLanguage(lines: readonly string[]): string {
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      continue;
    }
    if (!trimmed.startsWith('#')) {
      break;
    }
    const header = LANGUAGE_HEADER.exec(trimmed);
    if (header?.[1] !== undefined && isKnownLanguage(header[1])) {
      return header[1];
    }
  }
  return DEFAULT_LANGUAGE;
}
