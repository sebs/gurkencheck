/**
 * The parts of the Language Server Protocol gurkencheck speaks, as types.
 *
 * Written out rather than taken from a package: these are the few shapes the
 * server and the VS Code extension pass between them, and a dependency for
 * them would be installed by everyone who only runs the command line.
 */

/** A place in a document: 0-based line, and 0-based UTF-16 offset in it. */
export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export const DiagnosticSeverity = {Error: 1, Warning: 2, Information: 3, Hint: 4} as const;

export interface Diagnostic {
  range: Range;
  severity: number;
  code: string;
  codeDescription?: {href: string};
  source: string;
  message: string;
}

export interface TextEdit {
  range: Range;
  newText: string;
}

export interface WorkspaceEdit {
  changes: Record<string, TextEdit[]>;
}

export interface CodeAction {
  title: string;
  kind: string;
  diagnostics?: Diagnostic[];
  isPreferred?: boolean;
  edit: WorkspaceEdit;
}

export const TextDocumentSyncKind = {None: 0, Full: 1, Incremental: 2} as const;

export const FileChangeType = {Created: 1, Changed: 2, Deleted: 3} as const;

export const MessageType = {Error: 1, Warning: 2, Info: 3, Log: 4} as const;

/** A glob relative to a folder, as protocol 3.17 has it. */
export interface RelativePattern {
  baseUri: string;
  pattern: string;
}

export interface FileSystemWatcher {
  globPattern: string | RelativePattern;
}

export interface InitializeParams {
  processId?: number | null;
  rootUri?: string | null;
  rootPath?: string | null;
  workspaceFolders?: {uri: string; name: string}[] | null;
  capabilities?: {
    workspace?: {
      didChangeWatchedFiles?: {dynamicRegistration?: boolean; relativePatternSupport?: boolean};
    };
  };
}

export interface TextDocumentItem {
  uri: string;
  languageId?: string;
  version: number;
  text: string;
}

export interface DidOpenParams {
  textDocument: TextDocumentItem;
}

export interface DidChangeParams {
  textDocument: {uri: string; version: number};
  /** With full sync, one change holding the whole text. */
  contentChanges: {text: string; range?: Range}[];
}

export interface DocumentParams {
  textDocument: {uri: string};
}

export interface DidChangeWatchedFilesParams {
  changes: {uri: string; type: number}[];
}

export interface CodeActionParams {
  textDocument: {uri: string};
  range: Range;
  context: {diagnostics: Diagnostic[]; only?: string[]};
}

export interface PublishDiagnosticsParams {
  uri: string;
  version?: number;
  diagnostics: Diagnostic[];
}
