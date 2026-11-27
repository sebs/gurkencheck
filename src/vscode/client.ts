/**
 * The VS Code extension: a client for gurkencheck's language server.
 *
 * It starts one server per workspace folder, as the server finds the
 * configuration and the files from the folder it runs in, and does what a
 * language client does for it - tells it which feature files are open and
 * what is in them, shows what it finds, asks it for quick fixes, and watches
 * the files it asks to have watched.
 *
 * The server is the package's own command line, `gurkencheck lsp`, run on
 * the Node that VS Code brings with it, so nothing has to be installed.
 */
import {spawn} from 'node:child_process';
import type {ChildProcessWithoutNullStreams} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type * as vscode from 'vscode';
import {Connection} from '../lsp/connection.ts';
import {DiagnosticSeverity, FileChangeType, MessageType} from '../lsp/protocol.ts';
import type {
  CodeAction,
  Diagnostic,
  FileSystemWatcher,
  PublishDiagnosticsParams,
  Range,
} from '../lsp/protocol.ts';

type Vscode = typeof vscode;

/** The command line the server is: `main.js` beside this file's folder. */
const here = fileURLToPath(import.meta.url);
const SERVER = path.join(path.dirname(here), '..', `main${path.extname(here)}`);

/** How long a server is given to shut down before it is stopped outright. */
const SHUTDOWN_MS = 2000;

const SOURCE = 'gurkencheck';

function isFeatureFile(document: vscode.TextDocument): boolean {
  return document.uri.scheme === 'file' && document.uri.path.endsWith('.feature');
}

function toLspRange(range: vscode.Range): Range {
  return {
    start: {line: range.start.line, character: range.start.character},
    end: {line: range.end.line, character: range.end.character},
  };
}

function codeOf(diagnostic: vscode.Diagnostic): string {
  const code = diagnostic.code;
  return typeof code === 'object' ? String(code.value) : String(code ?? '');
}

/** One folder's server, from start to stop. */
class FolderServer {
  readonly #api: Vscode;
  readonly #folder: vscode.WorkspaceFolder;
  readonly #output: vscode.OutputChannel;
  readonly #diagnostics: vscode.DiagnosticCollection;
  #child: ChildProcessWithoutNullStreams | undefined;
  #connection: Connection | undefined;
  /** The documents the server has been told are open. */
  readonly #open = new Set<string>();
  /** The files the server has shown findings for, to clear when it stops. */
  readonly #published = new Set<string>();
  readonly #watchers = new Map<string, vscode.Disposable[]>();
  #stopping = false;

  constructor(api: Vscode, folder: vscode.WorkspaceFolder, output: vscode.OutputChannel, diagnostics: vscode.DiagnosticCollection) {
    this.#api = api;
    this.#folder = folder;
    this.#output = output;
    this.#diagnostics = diagnostics;
  }

  async start(): Promise<void> {
    this.#stopping = false;
    const child = spawn(process.execPath, [SERVER, 'lsp', '--stdio'], {
      cwd: this.#folder.uri.fsPath,
      // VS Code's own executable, run as plain Node.
      env: {...process.env, ELECTRON_RUN_AS_NODE: '1'},
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.#child = child;
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (text: string) => this.#output.append(text));
    child.on('error', (thrown) => {
      this.#output.appendLine(`Could not start the server for "${this.#folder.name}": ${thrown.message}`);
    });
    child.on('exit', (code, signal) => {
      if (this.#child === child) {
        this.#gone();
      }
      if (!this.#stopping) {
        this.#output.appendLine(
          `The server for "${this.#folder.name}" stopped (${signal ?? `exit code ${code}`}). Run "gurkencheck: Restart the language server" to start it again.`,
        );
      }
    });

    const connection = new Connection(child.stdout, child.stdin);
    this.#connection = connection;
    connection.onProblem = (message) => this.#output.appendLine(message);
    connection.onNotification('textDocument/publishDiagnostics', (raw) => this.#show(raw as PublishDiagnosticsParams));
    connection.onNotification('window/logMessage', (raw) => {
      this.#output.appendLine((raw as {message: string}).message);
    });
    connection.onNotification('window/showMessage', (raw) => {
      const {type, message} = raw as {type: number; message: string};
      const show =
        type === MessageType.Error
          ? this.#api.window.showErrorMessage
          : type === MessageType.Warning
            ? this.#api.window.showWarningMessage
            : this.#api.window.showInformationMessage;
      void show(message);
    });
    connection.onRequest('client/registerCapability', (raw) => {
      this.#register(raw as {registrations: {id: string; method: string; registerOptions?: {watchers?: FileSystemWatcher[]}}[]});
      return null;
    });
    connection.onRequest('client/unregisterCapability', (raw) => {
      for (const {id} of (raw as {unregisterations?: {id: string}[]}).unregisterations ?? []) {
        this.#unwatch(id);
      }
      return null;
    });

    try {
      await connection.request('initialize', {
        processId: process.pid,
        clientInfo: {name: 'gurkencheck for VS Code'},
        rootUri: this.#folder.uri.toString(),
        workspaceFolders: [{uri: this.#folder.uri.toString(), name: this.#folder.name}],
        capabilities: {
          general: {positionEncodings: ['utf-16']},
          workspace: {didChangeWatchedFiles: {dynamicRegistration: true, relativePatternSupport: true}},
          textDocument: {
            synchronization: {didSave: true},
            publishDiagnostics: {versionSupport: true, codeDescriptionSupport: true},
            codeAction: {codeActionLiteralSupport: {codeActionKind: {valueSet: ['quickfix']}}, isPreferredSupport: true},
          },
        },
      });
    } catch (thrown) {
      this.#output.appendLine(
        `The server for "${this.#folder.name}" did not start: ${thrown instanceof Error ? thrown.message : String(thrown)}`,
      );
      return;
    }
    connection.notify('initialized', {});
    for (const document of this.#api.workspace.textDocuments) {
      this.open(document);
    }
  }

  /** True when the document is a feature file this folder's server checks. */
  owns(document: vscode.TextDocument): boolean {
    return isFeatureFile(document) && this.#api.workspace.getWorkspaceFolder(document.uri) === this.#folder;
  }

  open(document: vscode.TextDocument): void {
    const uri = document.uri.toString();
    if (this.#connection === undefined || !this.owns(document) || this.#open.has(uri)) return;
    this.#open.add(uri);
    this.#connection.notify('textDocument/didOpen', {
      textDocument: {uri, languageId: document.languageId, version: document.version, text: document.getText()},
    });
  }

  change(document: vscode.TextDocument): void {
    const uri = document.uri.toString();
    if (this.#connection === undefined || !this.#open.has(uri)) return;
    this.#connection.notify('textDocument/didChange', {
      textDocument: {uri, version: document.version},
      contentChanges: [{text: document.getText()}],
    });
  }

  save(document: vscode.TextDocument): void {
    const uri = document.uri.toString();
    if (this.#connection === undefined || !this.#open.has(uri)) return;
    this.#connection.notify('textDocument/didSave', {textDocument: {uri}});
  }

  close(document: vscode.TextDocument): void {
    const uri = document.uri.toString();
    if (this.#connection === undefined || !this.#open.delete(uri)) return;
    this.#connection.notify('textDocument/didClose', {textDocument: {uri}});
  }

  async codeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext): Promise<vscode.CodeAction[]> {
    const api = this.#api;
    const ours = context.diagnostics.filter((diagnostic) => diagnostic.source === SOURCE);
    if (this.#connection === undefined || ours.length === 0) return [];
    if (context.only !== undefined && !api.CodeActionKind.QuickFix.intersects(context.only)) return [];

    const asLsp = (diagnostic: vscode.Diagnostic): Diagnostic => ({
      range: toLspRange(diagnostic.range),
      severity: diagnostic.severity === api.DiagnosticSeverity.Warning ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error,
      code: codeOf(diagnostic),
      source: SOURCE,
      message: diagnostic.message,
    });
    let answer: CodeAction[] | null;
    try {
      answer = await this.#connection.request<CodeAction[] | null>('textDocument/codeAction', {
        textDocument: {uri: document.uri.toString()},
        range: toLspRange(range),
        context: {diagnostics: ours.map(asLsp)},
      });
    } catch {
      return [];
    }
    return (answer ?? []).map((given) => {
      const action = new api.CodeAction(given.title, api.CodeActionKind.QuickFix);
      action.isPreferred = given.isPreferred === true;
      action.diagnostics = ours.filter((diagnostic) =>
        (given.diagnostics ?? []).some(
          (about) =>
            about.code === codeOf(diagnostic) &&
            about.message === diagnostic.message &&
            about.range.start.line === diagnostic.range.start.line,
        ),
      );
      const edit = new api.WorkspaceEdit();
      for (const [uri, edits] of Object.entries(given.edit.changes)) {
        for (const {range: at, newText} of edits) {
          edit.replace(api.Uri.parse(uri), this.#range(at), newText);
        }
      }
      action.edit = edit;
      return action;
    });
  }

  async stop(): Promise<void> {
    this.#stopping = true;
    const child = this.#child;
    const connection = this.#connection;
    if (child !== undefined && connection !== undefined && child.exitCode === null) {
      let timer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          connection.request('shutdown'),
          new Promise((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error('no answer')), SHUTDOWN_MS);
          }),
        ]);
        connection.notify('exit');
      } catch {
        // Not answering is the same as having gone: it is stopped below.
      } finally {
        clearTimeout(timer);
      }
      const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
      const killer = setTimeout(() => child.kill(), SHUTDOWN_MS);
      await exited;
      clearTimeout(killer);
    }
    this.#gone();
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /** Forgets the server, and clears what it showed. */
  #gone(): void {
    this.#child = undefined;
    this.#connection = undefined;
    this.#open.clear();
    for (const uri of this.#published) {
      this.#diagnostics.delete(this.#api.Uri.parse(uri));
    }
    this.#published.clear();
    for (const id of [...this.#watchers.keys()]) {
      this.#unwatch(id);
    }
  }

  #range(range: Range): vscode.Range {
    return new this.#api.Range(range.start.line, range.start.character, range.end.line, range.end.character);
  }

  #show({uri, diagnostics}: PublishDiagnosticsParams): void {
    const api = this.#api;
    const target = api.Uri.parse(uri);
    if (diagnostics.length === 0) {
      this.#diagnostics.delete(target);
      this.#published.delete(uri);
      return;
    }
    this.#published.add(uri);
    this.#diagnostics.set(
      target,
      diagnostics.map((given) => {
        const severity =
          given.severity === DiagnosticSeverity.Warning
            ? api.DiagnosticSeverity.Warning
            : given.severity === DiagnosticSeverity.Error
              ? api.DiagnosticSeverity.Error
              : api.DiagnosticSeverity.Information;
        const diagnostic = new api.Diagnostic(this.#range(given.range), given.message, severity);
        diagnostic.source = given.source;
        diagnostic.code =
          given.codeDescription === undefined
            ? given.code
            : {value: given.code, target: api.Uri.parse(given.codeDescription.href)};
        return diagnostic;
      }),
    );
  }

  #register({registrations}: {registrations: {id: string; method: string; registerOptions?: {watchers?: FileSystemWatcher[]}}[]}): void {
    const api = this.#api;
    for (const {id, method, registerOptions} of registrations) {
      if (method !== 'workspace/didChangeWatchedFiles') continue;
      this.#unwatch(id);
      const disposables: vscode.Disposable[] = [];
      for (const {globPattern} of registerOptions?.watchers ?? []) {
        const pattern =
          typeof globPattern === 'string'
            ? new api.RelativePattern(this.#folder, globPattern)
            : new api.RelativePattern(api.Uri.parse(globPattern.baseUri), globPattern.pattern);
        const watcher = api.workspace.createFileSystemWatcher(pattern);
        const tell = (type: number) => (uri: vscode.Uri) => {
          this.#connection?.notify('workspace/didChangeWatchedFiles', {changes: [{uri: uri.toString(), type}]});
        };
        disposables.push(
          watcher,
          watcher.onDidCreate(tell(FileChangeType.Created)),
          watcher.onDidChange(tell(FileChangeType.Changed)),
          watcher.onDidDelete(tell(FileChangeType.Deleted)),
        );
      }
      this.#watchers.set(id, disposables);
    }
  }

  #unwatch(id: string): void {
    for (const disposable of this.#watchers.get(id) ?? []) disposable.dispose();
    this.#watchers.delete(id);
  }
}

/** What the entry point needs to stop the extension again. */
export interface Client {
  deactivate(): Promise<void>;
}

/** Starts the extension: a server for every folder in the workspace. */
export function activate(api: Vscode, context: vscode.ExtensionContext): Client {
  const output = api.window.createOutputChannel('gurkencheck');
  const diagnostics = api.languages.createDiagnosticCollection(SOURCE);
  const servers = new Map<string, FolderServer>();

  const startFor = (folder: vscode.WorkspaceFolder): void => {
    const key = folder.uri.toString();
    if (folder.uri.scheme !== 'file' || servers.has(key)) return;
    const server = new FolderServer(api, folder, output, diagnostics);
    servers.set(key, server);
    void server.start();
  };
  const serverFor = (uri: vscode.Uri): FolderServer | undefined => {
    const folder = api.workspace.getWorkspaceFolder(uri);
    return folder === undefined ? undefined : servers.get(folder.uri.toString());
  };

  for (const folder of api.workspace.workspaceFolders ?? []) {
    startFor(folder);
  }

  context.subscriptions.push(
    output,
    diagnostics,
    api.workspace.onDidChangeWorkspaceFolders(({added, removed}) => {
      for (const folder of removed) {
        const key = folder.uri.toString();
        void servers.get(key)?.stop();
        servers.delete(key);
      }
      for (const folder of added) startFor(folder);
    }),
    api.workspace.onDidOpenTextDocument((document) => serverFor(document.uri)?.open(document)),
    api.workspace.onDidChangeTextDocument(({document}) => serverFor(document.uri)?.change(document)),
    api.workspace.onDidSaveTextDocument((document) => serverFor(document.uri)?.save(document)),
    api.workspace.onDidCloseTextDocument((document) => serverFor(document.uri)?.close(document)),
    api.languages.registerCodeActionsProvider(
      {scheme: 'file', pattern: '**/*.feature'},
      {
        provideCodeActions: (document, range, context) =>
          serverFor(document.uri)?.codeActions(document, range, context) ?? [],
      },
      {providedCodeActionKinds: [api.CodeActionKind.QuickFix]},
    ),
    api.commands.registerCommand('gurkencheck.restart', async () => {
      await Promise.all([...servers.values()].map((server) => server.restart()));
    }),
  );

  return {
    async deactivate() {
      await Promise.all([...servers.values()].map((server) => server.stop()));
      servers.clear();
    },
  };
}
