/**
 * `gurkencheck lsp`: the language server, over stdin and stdout.
 */
import {parseArgs} from 'node:util';
import {EXIT_OK, EXIT_USAGE} from '../exit-codes.ts';
import type {Diagnostics} from '../diagnostics.ts';
import {splitIgnoreList} from '../feature-finder.ts';
import {describeArgumentError} from '../util/args.ts';
import {Connection} from './connection.ts';
import {serve} from './server.ts';

export function lspUsage(): string {
  return [
    'Usage: gurkencheck lsp [options]',
    '',
    'Runs gurkencheck as a language server, speaking the Language Server',
    'Protocol over stdin and stdout, for an editor to start.',
    '',
    'Options:',
    '  --stdio                 talk over stdin and stdout (the default, and only, way)',
    '  -c, --config <path>     configuration file (default: the nearest .gurkencheckrc)',
    '  -i, --ignore <globs>    comma separated globs to skip, overriding .gurkencheckignore;',
    '                          may be given more than once',
    '  -r, --rulesdir <dir>    directory of custom rules; may be given more than once',
    '  -l, --language <code>   dialect for files with no "# language:" header',
    '  -h, --help              show this message',
    '',
    'The workspace folder the editor opens is the working directory: the',
    'configuration, the ignore file and the feature files are found from there,',
    'as the command line finds them.',
  ].join('\n');
}

/**
 * Runs the server until the editor tells it to exit.
 *
 * Standard output belongs to the protocol while it runs. Anything else
 * written there - a custom rule's console.log - would be read by the editor
 * as a broken message and could end the session, so the console is pointed
 * at standard error for as long as the server runs.
 */
export async function runLsp(argv: readonly string[], diagnostics: Diagnostics): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      options: {
        stdio: {type: 'boolean'},
        config: {type: 'string', short: 'c'},
        ignore: {type: 'string', short: 'i', multiple: true},
        rulesdir: {type: 'string', short: 'r', multiple: true},
        language: {type: 'string', short: 'l'},
        help: {type: 'boolean', short: 'h'},
      },
      allowPositionals: false,
    });
  } catch (thrown) {
    diagnostics.report({level: 'error', message: describeArgumentError(thrown, lspUsage())});
    diagnostics.report({level: 'notice', message: 'Run "gurkencheck lsp --help" to see the options.'});
    return EXIT_USAGE;
  }
  const {values} = parsed;
  if (values.help === true) {
    console.log(lspUsage());
    return EXIT_OK;
  }

  const toStderr = (...args: unknown[]): void => console.error(...args);
  const saved = {log: console.log, info: console.info, debug: console.debug, warn: console.warn};
  Object.assign(console, {log: toStderr, info: toStderr, debug: toStderr, warn: toStderr});
  try {
    const connection = new Connection(process.stdin, process.stdout);
    return await serve(connection, {
      config: values.config,
      rulesdirs: values.rulesdir ?? [],
      ignore: values.ignore?.flatMap(splitIgnoreList),
      language: values.language,
    });
  } finally {
    Object.assign(console, saved);
    // Left listening, stdin would keep the process running after the exit.
    process.stdin.destroy();
  }
}
