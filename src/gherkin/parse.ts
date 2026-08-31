/**
 * Parsing feature files, and turning the parser's complaints into lint errors.
 *
 * A handful of Gherkin constructs are rejected by the parser itself rather
 * than by a rule: a second Feature, a second Background, a tag on a
 * Background, and a step continued onto the next line. Those show up here as
 * parse failures, and this module maps them onto the rule names users see.
 * Because the parser refuses to build a document for such a file, these
 * checks cannot be switched off.
 */
import {AstBuilder, GherkinClassicTokenMatcher, Parser} from '@cucumber/gherkin';
import {IdGenerator} from '@cucumber/messages';
import type {Feature} from '@cucumber/messages';
import {readFile} from 'node:fs/promises';
import type {FeatureFile, RuleError} from '../types.ts';
import type {Dialect} from './dialects.ts';
import {DEFAULT_LANGUAGE, detectLanguage, getDialect} from './dialects.ts';

/**
 * Rules the parser enforces on every file. They cannot be turned off, but
 * they may be named in a configuration file, because they are documented
 * alongside the rules that can.
 */
export const ALWAYS_ON_RULES = [
  'no-tags-on-backgrounds',
  'one-feature-per-file',
  'up-to-one-background-per-file',
  'background-before-scenarios',
  'no-multiline-steps',
] as const;

/** The rule names parse errors are reported under. */
export const PARSER_RULES = [...ALWAYS_ON_RULES, 'unexpected-error'] as const;

/** The outcome of reading and parsing one feature file. */
export interface ParseResult {
  file: FeatureFile;
  /** The parsed feature, or `undefined` when parsing failed or the file is empty. */
  feature: Feature | undefined;
  /** Fatal parse errors. When this is non-empty, no rules are run on the file. */
  errors: RuleError[];
}

/** One complaint from the Gherkin parser, in structured form. */
interface ParserComplaint {
  line: number;
  column: number;
  /** Token kinds the parser would have accepted, e.g. `#StepLine`. */
  expected: string[];
  /** The offending text, or `undefined` when the file ended too early. */
  got: string | undefined;
  /** The parser's own message, used when nothing more specific applies. */
  raw: string;
}

const UNEXPECTED_TOKEN = /^\((\d+):(\d+)\): expected: (.*), got '([\s\S]*)'$/;
const UNEXPECTED_EOF = /^\((\d+):(\d+)\): unexpected end of file, expected: (.*)$/;

/** How many times a tag-on-background may be stripped before giving up. */
const MAX_TAG_RECOVERIES = 20;

function newParser(defaultLanguage: string): Parser<unknown> {
  return new Parser(
    new AstBuilder(IdGenerator.uuid()),
    new GherkinClassicTokenMatcher(defaultLanguage),
  );
}

function toComplaint(error: unknown): ParserComplaint {
  const raw = error instanceof Error ? error.message : String(error);
  const location = (error as {location?: {line?: number; column?: number}}).location;

  const unexpectedToken = UNEXPECTED_TOKEN.exec(raw);
  if (unexpectedToken) {
    return {
      line: Number(unexpectedToken[1]),
      column: Number(unexpectedToken[2]),
      expected: unexpectedToken[3]!.split(', '),
      got: unexpectedToken[4]!,
      raw,
    };
  }

  const unexpectedEof = UNEXPECTED_EOF.exec(raw);
  if (unexpectedEof) {
    return {
      line: Number(unexpectedEof[1]),
      column: Number(unexpectedEof[2]),
      expected: unexpectedEof[3]!.split(', '),
      got: undefined,
      raw,
    };
  }

  return {
    line: location?.line ?? 0,
    column: location?.column ?? 0,
    expected: [],
    got: undefined,
    raw,
  };
}

function parseSource(
  source: string,
  defaultLanguage: string,
): {feature: Feature | undefined; complaints: ParserComplaint[]} {
  try {
    const document = newParser(defaultLanguage).parse(source);
    return {feature: document.feature ?? undefined, complaints: []};
  } catch (thrown) {
    const nested = (thrown as {errors?: unknown[]}).errors;
    const errors = Array.isArray(nested) && nested.length > 0 ? nested : [thrown];
    return {feature: undefined, complaints: errors.map(toComplaint)};
  }
}

/** True when the offending text opens a node of one of the given keywords. */
function startsWithKeyword(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => text.startsWith(`${keyword.trim()}:`));
}

/**
 * True when a Background is already open above `line`.
 *
 * The parser rejects a second Background and a Background written below a
 * Scenario in exactly the same way, but they are different mistakes with
 * different fixes, so the lines above are checked to tell them apart.
 */
function hasEarlierBackground(
  lines: readonly string[],
  line: number,
  dialect: Dialect,
): boolean {
  return lines
    .slice(0, Math.max(0, line - 1))
    .some((text) => startsWithKeyword(text.trim(), dialect.background));
}

/** The step keywords of a dialect, without the `*` wildcard, for messages. */
function stepKeywordsFor(dialect: Dialect): string[] {
  return [dialect.given, dialect.when, dialect.then, dialect.and, dialect.but]
    .map((keywords) => keywords.map((keyword) => keyword.trim()).find((keyword) => keyword !== '*'))
    .filter((keyword): keyword is string => keyword !== undefined);
}

/**
 * A tag written directly above a Background. The parser reports this as
 * "expected a tag line or a rule line" - it is still waiting for something a
 * tag can attach to, and a Background is not one of those things.
 */
function isTagOnBackground(complaint: ParserComplaint, dialect: Dialect): boolean {
  return (
    complaint.got !== undefined &&
    complaint.expected.includes('#TagLine') &&
    !complaint.expected.includes('#ScenarioLine') &&
    !complaint.expected.includes('#StepLine') &&
    startsWithKeyword(complaint.got, dialect.background)
  );
}

/**
 * Blanks the tag lines sitting above `line`, so the file can be parsed again
 * to find the problems hiding behind the tag. Lines are blanked rather than
 * removed so that every other line number stays correct.
 *
 * Returns `undefined` when there was no tag line to blank.
 */
function withoutTagsAbove(lines: readonly string[], line: number): string[] | undefined {
  const result = [...lines];
  let index = line - 2;
  let blanked = false;

  while (index >= 0) {
    const trimmed = result[index]!.trim();
    if (trimmed.startsWith('@')) {
      result[index] = '';
      blanked = true;
    } else if (trimmed !== '' && !trimmed.startsWith('#')) {
      break;
    }
    index--;
  }

  return blanked ? result : undefined;
}

function classify(
  complaint: ParserComplaint,
  dialect: Dialect,
  lines: readonly string[],
): RuleError {
  if (complaint.got !== undefined) {
    if (startsWithKeyword(complaint.got, dialect.background)) {
      return hasEarlierBackground(lines, complaint.line, dialect)
        ? {
            message: 'Multiple "Background" definitions in the same file are disallowed',
            rule: 'up-to-one-background-per-file',
            line: complaint.line,
            column: complaint.column,
          }
        : {
            message: 'A "Background" must come before the Scenarios it applies to',
            rule: 'background-before-scenarios',
            line: complaint.line,
            column: complaint.column,
          };
    }
    if (startsWithKeyword(complaint.got, dialect.feature)) {
      return {
        message: 'Multiple "Feature" definitions in the same file are disallowed',
        rule: 'one-feature-per-file',
        line: complaint.line,
        column: complaint.column,
      };
    }
    if (complaint.expected.includes('#StepLine') && complaint.expected.includes('#DocStringSeparator')) {
      const keywords = stepKeywordsFor(dialect);
      const last = keywords.pop();
      const list = `${keywords.map((keyword) => `"${keyword}"`).join(', ')} or "${last}"`;
      return {
        message: `Steps should begin with ${list}. Multiline steps are disallowed`,
        rule: 'no-multiline-steps',
        line: complaint.line,
        column: complaint.column,
      };
    }
  }
  return {
    message: complaint.raw,
    rule: 'unexpected-error',
    line: complaint.line,
    column: complaint.column,
  };
}

/** Splits source text into lines, accepting any of the three line endings. */
export function toLines(source: string): string[] {
  return source.split(/\r\n|\r|\n/);
}

/**
 * Parses feature file source. When the parser rejects the file, the returned
 * `feature` is `undefined` and `errors` describes what went wrong.
 *
 * `defaultLanguage` is the dialect to read a file in when it carries no
 * `# language:` header of its own, for projects written entirely in one
 * language.
 */
export function parseFeature(
  relativePath: string,
  source: string,
  defaultLanguage: string = DEFAULT_LANGUAGE,
): ParseResult {
  const lines = toLines(source);
  const file: FeatureFile = {relativePath, lines};
  const dialect = getDialect(detectLanguage(lines, defaultLanguage));

  const errors: RuleError[] = [];
  let workingLines: readonly string[] = lines;

  for (let attempt = 0; attempt <= MAX_TAG_RECOVERIES; attempt++) {
    const {feature, complaints} = parseSource(workingLines.join('\n'), defaultLanguage);

    if (complaints.length === 0) {
      return {file, feature: errors.length > 0 ? undefined : feature, errors};
    }

    const first = complaints[0]!;
    if (isTagOnBackground(first, dialect)) {
      const recovered = withoutTagsAbove(workingLines, first.line);
      if (recovered !== undefined) {
        errors.push({
          message: 'Tags on Backgrounds are disallowed',
          rule: 'no-tags-on-backgrounds',
          line: first.line,
          column: first.column,
        });
        workingLines = recovered;
        continue;
      }
    }

    const classified = complaints.map((complaint) => classify(complaint, dialect, workingLines));

    // A Background in the wrong place derails everything after it: each
    // following line is rejected in turn, and none of those complaints tells
    // the reader anything the first one did not. Report the cause on its own.
    const misplacedBackground = classified[0];
    if (misplacedBackground?.rule === 'background-before-scenarios') {
      errors.push(misplacedBackground);
      return {file, feature: undefined, errors};
    }

    errors.push(...classified);
    return {file, feature: undefined, errors};
  }

  return {file, feature: undefined, errors};
}

/**
 * Reads a feature file from disk and parses it.
 *
 * A file that cannot be read at all - missing, unreadable, deleted between
 * being found and being opened - comes back as a result carrying the reason,
 * exactly as a file the parser rejected does. Nothing here throws: one
 * unreadable file among a thousand should cost you that file's findings, not
 * every other file's as well.
 */
export async function readAndParseFile(
  relativePath: string,
  defaultLanguage?: string,
): Promise<ParseResult> {
  let source: string;
  try {
    source = await readFile(relativePath, 'utf8');
  } catch (thrown) {
    return {
      file: {relativePath, lines: []},
      feature: undefined,
      errors: [
        {
          message: thrown instanceof Error ? thrown.message : String(thrown),
          rule: 'unexpected-error',
          line: 0,
        },
      ],
    };
  }
  return parseFeature(relativePath, source, defaultLanguage);
}
