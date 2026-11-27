/**
 * The language server, driven as an editor drives it: over a connection,
 * with a project on disk and documents that may differ from it.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PassThrough} from 'node:stream';
import {afterEach, test} from 'node:test';
import {pathToFileURL} from 'node:url';
import {Connection, ErrorCodes, ResponseError, frame} from '../src/lsp/connection.ts';
import type {CodeAction, Diagnostic, PublishDiagnosticsParams} from '../src/lsp/protocol.ts';
import {rangeOf} from '../src/lsp/positions.ts';
import {serve} from '../src/lsp/server.ts';
import type {ServerOptions} from '../src/lsp/server.ts';

const startedIn = process.cwd();
const projects: string[] = [];

afterEach(() => {
  // The server changes to the folder it serves.
  process.chdir(startedIn);
  for (const project of projects.splice(0)) {
    fs.rmSync(project, {recursive: true, force: true});
  }
});

/** A project on disk: file name to content. */
function project(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-lsp-'));
  projects.push(root);
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), {recursive: true});
    fs.writeFileSync(path.join(root, name), content);
  }
  return root;
}

const uriOf = (root: string, name: string): string => pathToFileURL(path.join(root, name)).href;

/** A client talking to a server in this process, and what it was told. */
interface Session {
  client: Connection;
  exit: Promise<number>;
  messages: {type: number; message: string}[];
  /** The next diagnostics for a file that pass the test, or the last ones if they do already. */
  diagnostics(uri: string, until?: (diagnostics: Diagnostic[]) => boolean): Promise<Diagnostic[]>;
  /** Every file diagnostics were published for. */
  published: Map<string, PublishDiagnosticsParams>;
}

async function start(root: string, options: ServerOptions = {}): Promise<Session> {
  const toServer = new PassThrough();
  const toClient = new PassThrough();
  const server = new Connection(toServer, toClient);
  const client = new Connection(toClient, toServer);
  const published = new Map<string, PublishDiagnosticsParams>();
  const waiting: {uri: string; until: (diagnostics: Diagnostic[]) => boolean; resolve: (d: Diagnostic[]) => void}[] = [];
  const messages: {type: number; message: string}[] = [];

  // Matched by the file's real path: the server names a file it was not
  // told about by where it really is, which on macOS is behind a link.
  const real = (uri: string): string => {
    const file = new URL(uri).pathname;
    try {
      return fs.realpathSync.native(decodeURIComponent(file));
    } catch {
      return decodeURIComponent(file);
    }
  };

  client.onNotification('textDocument/publishDiagnostics', (raw) => {
    const params = raw as PublishDiagnosticsParams;
    published.set(real(params.uri), params);
    for (const waiter of [...waiting]) {
      if (waiter.uri === real(params.uri) && waiter.until(params.diagnostics)) {
        waiting.splice(waiting.indexOf(waiter), 1);
        waiter.resolve(params.diagnostics);
      }
    }
  });
  client.onNotification('window/showMessage', (raw) => messages.push(raw as {type: number; message: string}));
  client.onRequest('client/registerCapability', () => null);

  const exit = serve(server, {settleMs: 5, ...options});
  const result = (await client.request('initialize', {
    rootUri: pathToFileURL(root).href,
    capabilities: {workspace: {didChangeWatchedFiles: {dynamicRegistration: true}}},
  })) as {capabilities: {textDocumentSync: {change: number}}};
  assert.equal(result.capabilities.textDocumentSync.change, 1);
  client.notify('initialized', {});

  return {
    client,
    exit,
    messages,
    published,
    diagnostics(uri, until = () => true) {
      const key = real(uri);
      const last = published.get(key);
      if (last !== undefined && until(last.diagnostics)) {
        return Promise.resolve(last.diagnostics);
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`No diagnostics as expected for ${uri}; last: ${JSON.stringify(published.get(key))}`)), 3000);
        waiting.push({
          uri: key,
          until,
          resolve: (diagnostics) => {
            clearTimeout(timer);
            resolve(diagnostics);
          },
        });
      });
    },
  };
}

async function stop(session: Session): Promise<number> {
  await session.client.request('shutdown');
  session.client.notify('exit');
  return session.exit;
}

const rulesOf = (diagnostics: Diagnostic[]): string[] => diagnostics.map((diagnostic) => diagnostic.code).sort();

const CLEAN = 'Feature: Clean\n\n  Scenario: Works\n    Given a thing\n    When it runs\n    Then it works\n';

test('the framing survives messages split anywhere, a character included', async () => {
  const input = new PassThrough();
  const connection = new Connection(input, new PassThrough());
  const seen: unknown[] = [];
  connection.onNotification('note', (params) => seen.push(params));
  const bytes = Buffer.concat([frame({jsonrpc: '2.0', method: 'note', params: 'grüße 😀'}), frame({jsonrpc: '2.0', method: 'note', params: 2})]);
  for (let index = 0; index < bytes.length; index++) {
    input.write(bytes.subarray(index, index + 1));
  }
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(seen, ['grüße 😀', 2]);
});

test('a request nobody handles is answered as not found', async () => {
  const a = new PassThrough();
  const b = new PassThrough();
  const one = new Connection(a, b);
  new Connection(b, a);
  await assert.rejects(one.request('nothing/here'), (thrown: unknown) => thrown instanceof ResponseError && thrown.code === ErrorCodes.MethodNotFound);
});

test('columns count UTF-16, as the protocol does, not characters', () => {
  // The finding is at character 14; the emoji before it takes two units.
  const line = '    Given 😀 x ';
  assert.deepEqual(rangeOf({line: 1, column: 14}, [line]), {start: {line: 0, character: 14}, end: {line: 0, character: 15}});
  // A finding about the whole file marks the first line.
  assert.deepEqual(rangeOf({line: 0}, ['Feature: x', '']), {start: {line: 0, character: 0}, end: {line: 0, character: 10}});
  // One past the end - the file ended too early - is put on the last line.
  assert.equal(rangeOf({line: 9}, ['a', 'b']).start.line, 1);
});

test('the workspace is checked on start, files nobody opened included', async () => {
  const root = project({
    '.gurkencheckrc': '{"no-trailing-spaces": "on", "no-unnamed-scenarios": "warn"}',
    'features/a.feature': 'Feature: A\n\n  Scenario:\n    Given x \n',
    'features/b.feature': CLEAN,
  });
  const session = await start(root);
  const diagnostics = await session.diagnostics(uriOf(root, 'features/a.feature'), (d) => d.length > 0);
  assert.deepEqual(rulesOf(diagnostics), ['no-trailing-spaces', 'no-unnamed-scenarios']);
  const warning = diagnostics.find((d) => d.code === 'no-unnamed-scenarios')!;
  assert.equal(warning.severity, 2);
  assert.equal(warning.source, 'gurkencheck');
  assert.match(warning.codeDescription!.href, /rules\/no-unnamed-scenarios\.html$/);
  assert.equal(await stop(session), 0);
});

test('an open document is checked as it stands, unsaved changes and all', async () => {
  const root = project({'.gurkencheckrc': '{"no-trailing-spaces": "on"}', 'a.feature': CLEAN});
  const session = await start(root);
  const uri = uriOf(root, 'a.feature');
  session.client.notify('textDocument/didOpen', {textDocument: {uri, languageId: 'feature', version: 1, text: CLEAN}});
  await session.diagnostics(uri, (d) => d.length === 0);

  session.client.notify('textDocument/didChange', {
    textDocument: {uri, version: 2},
    contentChanges: [{text: CLEAN.replace('Given a thing', 'Given a thing   ')}],
  });
  const changed = await session.diagnostics(uri, (d) => d.length === 1);
  assert.equal(changed[0]!.code, 'no-trailing-spaces');
  assert.deepEqual(changed[0]!.range, {start: {line: 3, character: 17}, end: {line: 3, character: 20}});
  assert.equal(session.published.get(fs.realpathSync.native(path.join(root, 'a.feature')))!.version, 2);

  // Closed without saving: what is on disk counts again.
  session.client.notify('textDocument/didClose', {textDocument: {uri}});
  await session.diagnostics(uri, (d) => d.length === 0);
  assert.equal(await stop(session), 0);
});

test('a duplicate across files stays shown while one of them is edited, and goes once fixed', async () => {
  const root = project({
    '.gurkencheckrc': '{"no-dupe-feature-names": "on", "no-trailing-spaces": "on"}',
    'one.feature': CLEAN,
    'two.feature': CLEAN,
  });
  const session = await start(root);
  const uri = uriOf(root, 'two.feature');
  await session.diagnostics(uri, (d) => rulesOf(d).includes('no-dupe-feature-names'));

  session.client.notify('textDocument/didOpen', {textDocument: {uri, version: 1, text: CLEAN}});
  session.client.notify('textDocument/didChange', {textDocument: {uri, version: 2}, contentChanges: [{text: `${CLEAN.trimEnd()} \n`}]});
  // A run over the one file cannot see the other, and must not take the
  // duplicate for gone.
  const edited = await session.diagnostics(uri, (d) => rulesOf(d).includes('no-trailing-spaces'));
  assert.deepEqual(rulesOf(edited), ['no-dupe-feature-names', 'no-trailing-spaces']);

  // Renamed and not saved: gone once typing stops, from both files.
  const renamed = CLEAN.replace('Feature: Clean', 'Feature: Another');
  session.client.notify('textDocument/didChange', {textDocument: {uri, version: 3}, contentChanges: [{text: renamed}]});
  await session.diagnostics(uri, (d) => d.length === 0);
  await session.diagnostics(uriOf(root, 'one.feature'), (d) => d.length === 0);
  assert.equal(await stop(session), 0);
});

test('an ignored file is not checked, even when open', async () => {
  const root = project({
    '.gurkencheckrc': '{"no-trailing-spaces": "on"}',
    '.gurkencheckignore': 'legacy\n',
    'legacy/old.feature': 'Feature: Old \n',
    'a.feature': 'Feature: A \n',
  });
  const session = await start(root);
  await session.diagnostics(uriOf(root, 'a.feature'), (d) => d.length === 1);
  const uri = uriOf(root, 'legacy/old.feature');
  session.client.notify('textDocument/didOpen', {textDocument: {uri, version: 1, text: 'Feature: Old \n'}});
  assert.deepEqual(await session.diagnostics(uri), []);
  assert.equal(await stop(session), 0);
});

test('a new file that is not saved yet is checked', async () => {
  const root = project({'.gurkencheckrc': '{"no-trailing-spaces": "on"}'});
  const session = await start(root);
  const uri = uriOf(root, 'new.feature');
  session.client.notify('textDocument/didOpen', {textDocument: {uri, version: 1, text: 'Feature: New \n'}});
  assert.deepEqual(rulesOf(await session.diagnostics(uri, (d) => d.length > 0)), ['no-trailing-spaces']);
  assert.equal(await stop(session), 0);
});

test('a broken configuration is said, once, and nothing is checked', async () => {
  const root = project({'.gurkencheckrc': '{"no-such-rule": "on"}', 'a.feature': 'Feature: A \n'});
  const session = await start(root);
  session.client.notify('workspace/didChangeWatchedFiles', {changes: [{uri: uriOf(root, '.gurkencheckrc'), type: 2}]});
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(session.messages.length, 1);
  assert.equal(session.messages[0]!.type, 1);
  assert.match(session.messages[0]!.message, /no-such-rule/);
  assert.equal(session.published.size, 0);

  // Fixed on disk: checked again.
  fs.writeFileSync(path.join(root, '.gurkencheckrc'), '{"no-trailing-spaces": "on"}');
  session.client.notify('workspace/didChangeWatchedFiles', {changes: [{uri: uriOf(root, '.gurkencheckrc'), type: 2}]});
  await session.diagnostics(uriOf(root, 'a.feature'), (d) => d.length === 1);
  assert.equal(await stop(session), 0);
});

test('quick fixes: the fix itself, and switching the rule off for the line or the file', async () => {
  const text = '# language: en\nFeature: A\n\n  Scenario: B\n    Given x  \n';
  const root = project({'.gurkencheckrc': '{"no-trailing-spaces": "on"}', 'a.feature': text});
  const session = await start(root);
  const uri = uriOf(root, 'a.feature');
  session.client.notify('textDocument/didOpen', {textDocument: {uri, version: 1, text}});
  const [diagnostic] = await session.diagnostics(uri, (d) => d.length === 1);

  const actions = (await session.client.request('textDocument/codeAction', {
    textDocument: {uri},
    range: diagnostic!.range,
    context: {diagnostics: [diagnostic]},
  })) as CodeAction[];
  assert.deepEqual(
    actions.map((action) => [action.title, action.isPreferred === true, action.edit.changes[uri]]),
    [
      ['Remove the trailing spaces', true, [{range: {start: {line: 4, character: 11}, end: {line: 4, character: 13}}, newText: ''}]],
      [
        'Disable no-trailing-spaces for this line',
        false,
        [{range: {start: {line: 4, character: 0}, end: {line: 4, character: 0}}, newText: '    # gurkencheck-disable-next-line no-trailing-spaces\n'}],
      ],
      [
        'Disable no-trailing-spaces for this file',
        false,
        // Below the language header.
        [{range: {start: {line: 1, character: 0}, end: {line: 1, character: 0}}, newText: '# gurkencheck-disable-file no-trailing-spaces\n'}],
      ],
    ],
  );
  assert.equal(await stop(session), 0);
});

test('no offer to switch off what the parser refuses', async () => {
  const text = 'Feature: A\n\n  Background:\n    Given x\n\n  Background:\n    Given y\n';
  const root = project({'.gurkencheckrc': '{}', 'a.feature': text});
  const session = await start(root);
  const uri = uriOf(root, 'a.feature');
  session.client.notify('textDocument/didOpen', {textDocument: {uri, version: 1, text}});
  const diagnostics = await session.diagnostics(uri, (d) => d.length > 0);
  assert.equal(diagnostics[0]!.code, 'up-to-one-background-per-file');
  const actions = await session.client.request('textDocument/codeAction', {
    textDocument: {uri},
    range: diagnostics[0]!.range,
    context: {diagnostics},
  });
  assert.deepEqual(actions, []);
  assert.equal(await stop(session), 0);
});

test('a missing new line at the end is added, in the line endings the file uses', async () => {
  const text = 'Feature: A\r\n\r\n  Scenario: B\r\n    Given x';
  const root = project({'.gurkencheckrc': '{"new-line-at-eof": ["on", "yes"]}', 'a.feature': text});
  const session = await start(root);
  const uri = uriOf(root, 'a.feature');
  const [diagnostic] = await session.diagnostics(uri, (d) => d.length === 1);
  const actions = (await session.client.request('textDocument/codeAction', {
    textDocument: {uri},
    range: diagnostic!.range,
    context: {diagnostics: [diagnostic]},
  })) as CodeAction[];
  assert.deepEqual(actions[0]!.edit.changes[uri], [{range: {start: {line: 3, character: 11}, end: {line: 3, character: 11}}, newText: '\r\n'}]);
  assert.equal(await stop(session), 0);
});

test('exit without a shutdown first exits 1, as the protocol asks', async () => {
  const root = project({'a.feature': CLEAN});
  const session = await start(root);
  session.client.notify('exit');
  assert.equal(await session.exit, 1);
});

test('gurkencheck lsp speaks the protocol on stdout, and a rule that logs does not break it', async () => {
  const root = project({
    'rules/noisy.mjs': "export default {name: 'noisy', run() { console.log('chatter'); return []; }};\n",
    '.gurkencheckrc': '{"noisy": "on", "no-trailing-spaces": "on"}',
    'a.feature': 'Feature: A \n',
  });
  const child = spawn(process.execPath, [path.join(startedIn, 'src/main.ts'), 'lsp', '--stdio', '--rulesdir', 'rules'], {cwd: root});
  const client = new Connection(child.stdout, child.stdin);
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const published = new Promise<PublishDiagnosticsParams>((resolve) => {
    client.onNotification('textDocument/publishDiagnostics', (raw) => resolve(raw as PublishDiagnosticsParams));
  });
  const exited = new Promise<number | null>((resolve) => child.on('exit', resolve));

  await client.request('initialize', {rootUri: pathToFileURL(root).href, capabilities: {}});
  client.notify('initialized', {});
  const {diagnostics} = await published;
  assert.deepEqual(rulesOf(diagnostics), ['no-trailing-spaces']);
  await client.request('shutdown');
  client.notify('exit');
  assert.equal(await exited, 0);
  assert.match(stderr, /chatter/);
});
