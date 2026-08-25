import type {FileResult} from '../types.ts';
import {attributes, cdata, escapeXml, indent, XML_DECLARATION} from '../util/xml.ts';

/** JUnit/xUnit XML, for CI systems that collect test reports. */
export function printResults(results: readonly FileResult[]): void {
  const testCases = results.map((result) => {
    const failures = result.errors.map((error) => {
      const open = `<error${attributes({message: error.message, type: 'gurkencheck-error'})}>`;
      const where =
        error.column === undefined
          ? `${result.filePath}:${error.line}`
          : `${result.filePath}:${error.line}:${error.column}`;
      const detail = cdata(`${where} (${error.rule}) ${error.message}`);
      return indent(`${open}${detail}</error>`, 2);
    });

    const open = `<testcase${attributes({name: result.filePath})}>`;
    const body = failures.length > 0 ? `\n${failures.join('\n')}\n${indent('', 1)}` : '';
    return indent(`${open}${body}</testcase>`, 1);
  });

  const suite = [
    `<testsuite${attributes({name: 'gurkencheck'})}>`,
    ...testCases,
    '</testsuite>',
  ].join('\n');

  console.error(`${XML_DECLARATION}\n${suite}`);
}

export {escapeXml};
