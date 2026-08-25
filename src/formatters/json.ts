/**
 * Machine readable output, in the shape eslint's JSON formatter uses.
 *
 * Matching eslint means the many tools already built around that shape -
 * report viewers, annotation actions, dashboards - work without anyone
 * writing a converter first.
 *
 * Results go to stdout so they can be redirected or piped. Anything that
 * stops the linter running is written to stderr instead.
 */
import type {FileResult, RuleError} from '../types.ts';

/** eslint's numeric severities. */
const SEVERITY = {error: 2, warning: 1} as const;

/** One finding, in eslint's shape. */
export interface JsonMessage {
  ruleId: string;
  severity: number;
  message: string;
  line: number;
  column?: number;
}

/** One file, in eslint's shape. */
export interface JsonResult {
  filePath: string;
  messages: JsonMessage[];
  errorCount: number;
  warningCount: number;
}

function toMessage(error: RuleError): JsonMessage {
  const message: JsonMessage = {
    ruleId: error.rule,
    severity: SEVERITY[error.severity ?? 'error'],
    message: error.message,
    line: error.line,
  };
  if (error.column !== undefined) {
    message.column = error.column;
  }
  return message;
}

/** Converts the results into eslint's JSON shape. */
export function toJson(results: readonly FileResult[]): JsonResult[] {
  return results.map((result) => {
    const messages = result.errors.map(toMessage);
    return {
      filePath: result.filePath,
      messages,
      errorCount: messages.filter((message) => message.severity === SEVERITY.error).length,
      warningCount: messages.filter((message) => message.severity === SEVERITY.warning).length,
    };
  });
}

/** Writes the results as a single line of JSON. */
export function printResults(results: readonly FileResult[]): void {
  console.log(JSON.stringify(toJson(results)));
}
