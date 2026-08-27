/**
 * Turning a node's localised keyword back into a language-neutral one.
 *
 * The keyword is the only way to tell a Scenario from a Scenario Outline,
 * because both arrive as a `scenario` node in the parsed document.
 */
import type {Background, Examples, Feature, Rule, Scenario, Step} from '@cucumber/messages';
import {getDialect} from './dialects.ts';

/** Any node that carries a Gherkin keyword. */
export type KeywordNode = Feature | Rule | Background | Scenario | Examples | Step;

/** The keyword categories used across the rules. */
export type NeutralKeyword =
  | 'feature'
  | 'rule'
  | 'background'
  | 'scenario'
  | 'scenariooutline'
  | 'examples'
  | 'given'
  | 'when'
  | 'then'
  | 'and'
  | 'but'
  | '';

const KEYWORD_FIELDS = [
  'feature',
  'rule',
  'background',
  'scenario',
  'scenarioOutline',
  'examples',
  'given',
  'when',
  'then',
  'and',
  'but',
] as const;

const STEP_KEYWORDS = new Set<NeutralKeyword>(['given', 'when', 'then', 'and', 'but']);

/**
 * Maps a node's localised keyword (`Szenario`) onto the language-neutral name
 * (`scenario`). Returns an empty string for keywords the dialect does not know.
 */
export function getNeutralKeyword(
  node: Pick<KeywordNode, 'keyword'>,
  language: string | undefined,
): NeutralKeyword {
  const dialect = getDialect(language);
  for (const field of KEYWORD_FIELDS) {
    if (dialect[field].includes(node.keyword)) {
      return field.toLowerCase() as NeutralKeyword;
    }
  }
  return '';
}

/**
 * The keyword of each step, with `And`, `But` and `*` replaced by the keyword
 * they carry on from.
 *
 * A step's own keyword does not say what the step does: `And I log in` is a
 * setup, an action or a verification depending only on what came before it.
 * A step that carries on from nothing - an `And` written first - resolves to
 * the empty string, the same as a keyword the dialect does not know.
 */
export function resolvedStepKeywords(
  steps: readonly Pick<Step, 'keyword'>[],
  language: string | undefined,
): NeutralKeyword[] {
  let carried: NeutralKeyword = '';

  return steps.map((step) => {
    const keyword = getNeutralKeyword(step, language);
    if (keyword === 'and' || keyword === 'but') {
      return carried;
    }
    carried = keyword;
    return keyword;
  });
}

/** True when the keyword is a Given/When/Then/And/But step keyword. */
export function isStepKeyword(keyword: NeutralKeyword): boolean {
  return STEP_KEYWORDS.has(keyword);
}

/** The display name for a node, as used in error messages. */
export function getNodeType(
  node: Pick<KeywordNode, 'keyword'>,
  language: string | undefined,
): string {
  const keyword = getNeutralKeyword(node, language);
  switch (keyword) {
    case 'feature':
      return 'Feature';
    case 'rule':
      return 'Rule';
    case 'background':
      return 'Background';
    case 'scenario':
      return 'Scenario';
    case 'scenariooutline':
      return 'Scenario Outline';
    case 'examples':
      return 'Examples';
    default:
      return isStepKeyword(keyword) ? 'Step' : '';
  }
}
