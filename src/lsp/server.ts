/**
 * gurkencheck as a language server.
 *
 * An editor tells the server which feature files are open and what is in
 * them, unsaved changes included, and the server tells it what is wrong with
 * them as they stand. The whole workspace is checked as well, so a file that
 * is not open still shows up with what is wrong with it.
 *
 * Two kinds of check run:
 *
 * - The file being edited, after each change. Rules looking across files -
 *   two features sharing a name - are left out of this one: a run over one
 *   file cannot see a second, and would say the duplicate had gone.
 * - Every file in the workspace, open ones as they stand in the editor, when
 *   the server starts, when a file is saved, when a feature file, the
 *   configuration or the ignore file changes on disk, and - when a rule
 *   looking across files is on - once typing stops for a moment. This is the
 *   run the command line does, and the one the rules looking across files
 *   report from; their findings are kept, and shown with the edited file's
 *   own until the next such run.
 *
 * Configuration, ignore file and files are found as the command line finds
 * them, from the working directory - which is the workspace folder the
 * editor names, so a server serves one folder.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {readConfiguration} from '../config-parser.ts';
import {findFeatureFiles} from '../feature-finder.ts';
import {isDocumented} from '../formatters/sarif.ts';
import {isKnownLanguage, unknownLanguageMessage} from '../gherkin/dialects.ts';
import {toLines} from '../gherkin/parse.ts';
import {lint} from '../linter.ts';
import {isRuleEnabled, loadRules} from '../rules.ts';
import type {Configuration, RuleError, RuleRegistry} from '../types.ts';
import {sortBy} from '../util/collections.ts';
import {reasonOf} from '../util/thrown.ts';
import {version} from '../version.ts';
import {codeActionsFor} from './code-actions.ts';
import type {Shown} from './code-actions.ts';
import {ErrorCodes, ResponseError} from './connection.ts';
import type {Connection} from './connection.ts';
import {toDiagnostic} from './positions.ts';
import {MessageType, TextDocumentSyncKind} from './protocol.ts';
import type {
  CodeAction,
  CodeActionParams,
  DidChangeParams,
  DidOpenParams,
  DocumentParams,
  FileSystemWatcher,
  InitializeParams,
} from './protocol.ts';

/** What the command line can be told, that a server can be told too. */
export interface ServerOptions {
  /** The configuration file, in place of the nearest `.gurkencheckrc`. */
  config?: string;
  /** Directories of custom rules. */
  rulesdirs?: readonly string[];
  /** Globs to skip, in place of the nearest `.gurkencheckignore`. */
  ignore?: readonly string[];
  /** The dialect for files with no `# language:` header. */
  language?: string;
  /**
   * How long to wait after a change before checking the file, in
   * milliseconds, so that typing a word is one check rather than one a key.
   */
  settleMs?: number;
}

/** The default wait after a change: under what reads as a pause. */
const DEFAULT_SETTLE_MS = 150;

/**
 * How many times that wait typing has to stop for before the whole workspace
 * is checked again, when a rule looking across files is on.
 */
const PAUSE_FACTOR = 5;

interface OpenDocument {
  uri: string;
  version: number;
  text: string;
}

interface Settings {
  configuration: Configuration;
  language: string | undefined;
  files: readonly string[];
}

/**
 * Where a file really is. The editor names a file by the path it opened,
 * the search by the path it walked, and the two differ wherever a link is on
 * the way - on macOS, the temporary directory and often the home folder are
 * behind one - and in case, on a disk that ignores it. Without this, an open
 * file was not one the search had found, and was never checked.
 */
function canonical(file: string): string {
  try {
    return fs.realpathSync.native(file);
  } catch {
    // Not saved yet: where its folder really is.
    try {
      return path.join(fs.realpathSync.native(path.dirname(file)), path.basename(file));
    } catch {
      return file;
    }
  }
}

function toPath(uri: string): string | undefined {
  if (!uri.startsWith('file:')) {
    return undefined;
  }
  try {
    return canonical(path.resolve(fileURLToPath(uri)));
  } catch {
    return undefined;
  }
}

function isInside(directory: string, file: string): boolean {
  const relative = path.relative(directory, file);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

/**
 * Runs a language server over a connection, until the client says to exit.
 * Settles with the exit code the protocol asks for: 0 after a shutdown, 1
 * without one.
 */
export function serve(connection: Connection, options: ServerOptions = {}): Promise<number> {
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
  const documents = new Map<string, OpenDocument>();
  /** The feature files the last search of the workspace found. */
  let workspaceFiles = new Set<string>();
  /** What the rules looking across files found in each file, last time. */
  let acrossFiles = new Map<string, RuleError[]>();
  /** What each file was last shown, for the quick fixes to find. */
  const shown = new Map<string, Shown[]>();
  let rules: RuleRegistry | undefined;
  let acrossFileRules = new Set<string>();
  let settings: Settings | undefined;
  /** The last problem told to the user, so a broken file is said once. */
  let lastProblem: string | undefined;
  let root = process.cwd();
  let initialized = false;
  let shuttingDown = false;
  let watchers: {dynamic: boolean; relative: boolean} = {dynamic: false, relative: false};

  const log = (message: string): void => {
    connection.notify('window/logMessage', {type: MessageType.Log, message});
  };
  connection.onProblem = log;

  /** Tells the user, once, about a problem that stops files being checked. */
  const tell = (message: string | undefined): void => {
    if (message !== undefined && message !== lastProblem) {
      connection.notify('window/showMessage', {type: MessageType.Error, message: `gurkencheck: ${message}`});
      log(message);
    }
    lastProblem = message;
  };

  const uriOf = (file: string): string => documents.get(file)?.uri ?? pathToFileURL(file).href;

  /** Sends a file's findings, or none, to the editor. */
  const publish = (file: string, errors: readonly RuleError[], lines: readonly string[] | undefined): void => {
    const uri = uriOf(file);
    const isDocumentedHere = (rule: string): boolean => isDocumented(rule, rules);
    const text = lines ?? (errors.length > 0 ? readLines(file) : []);
    const entries = errors.map((error) => ({error, diagnostic: toDiagnostic(error, text, isDocumentedHere)}));
    if (entries.length === 0) {
      shown.delete(file);
    } else {
      shown.set(file, entries);
    }
    const document = documents.get(file);
    connection.notify('textDocument/publishDiagnostics', {
      uri,
      ...(document === undefined ? {} : {version: document.version}),
      diagnostics: entries.map((entry) => entry.diagnostic),
    });
  };

  const readText = (file: string): string => {
    try {
      return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/u, '');
    } catch {
      return '';
    }
  };
  const readLines = (file: string): string[] => toLines(readText(file));

  /** Reads the configuration again, saying what is wrong with it if anything. */
  const readSettings = async (): Promise<Settings | undefined> => {
    if (rules === undefined) {
      return undefined;
    }
    const read = await readConfiguration(options.config, rules);
    if (!read.ok) {
      tell([read.message, ...(read.details ?? [])].join(' '));
      return undefined;
    }
    const language = options.language ?? read.language;
    if (language !== undefined && !isKnownLanguage(language)) {
      tell(unknownLanguageMessage(language, ''));
      return undefined;
    }
    acrossFileRules = new Set(
      [...rules.values()]
        .filter((rule) => rule.onRunEnd !== undefined && isRuleEnabled(read.configuration[rule.name]))
        .map((rule) => rule.name),
    );
    return {configuration: read.configuration, language, files: read.files ?? []};
  };

  /**
   * True when the server checks this file: one the search of the workspace
   * found - which leaves out what the ignore file skips - or, as a search
   * cannot find it, an unsaved new feature file in the workspace.
   */
  const isChecked = (file: string): boolean =>
    workspaceFiles.has(file) || (file.endsWith('.feature') && isInside(root, file) && !fs.existsSync(file));

  // Checking the workspace, one run at a time: one asked for while another
  // is going is run once that one is done, and asks in between are one ask.
  let workspaceRun: Promise<void> | undefined;
  let workspaceAgain = false;
  let workspaceTimer: NodeJS.Timeout | undefined;

  const checkWorkspace = async (): Promise<void> => {
    settings = await readSettings();
    const previous = new Set(shown.keys());
    if (settings === undefined) {
      // Nothing can be checked, and findings from a configuration that is
      // no longer the one in force would be wrong; what is wrong was said.
      workspaceFiles = new Set();
      acrossFiles = new Map();
      for (const file of previous) publish(file, [], undefined);
      return;
    }
    let found;
    try {
      found = findFeatureFiles([], options.ignore);
    } catch (thrown) {
      tell(reasonOf(thrown));
      return;
    }
    tell(undefined);
    for (const {directory, reason} of found.unreadable) {
      log(`Could not read the directory "${directory}": ${reason}.`);
    }
    workspaceFiles = new Set(found.files.map((file) => canonical(path.resolve(file))));
    const files = [...workspaceFiles];
    for (const file of documents.keys()) {
      if (!workspaceFiles.has(file) && isChecked(file)) files.push(file);
    }
    const contents = new Map([...documents].map(([file, document]) => [file, document.text]));
    const versions = new Map([...documents].map(([file, document]) => [file, document.version]));

    const results = await lint(files, settings.configuration, rules!, {language: settings.language, contents});
    const across = new Map<string, RuleError[]>();
    for (const result of results) {
      const file = canonical(path.resolve(result.filePath));
      const fromAcross = result.errors.filter((error) => acrossFileRules.has(error.rule));
      if (fromAcross.length > 0) across.set(file, fromAcross);
      if (!file.endsWith('.feature')) {
        // A finding about the run rather than a file - a rule that failed
        // looking back over it, in a workspace with no feature files.
        for (const error of result.errors) log(`${error.rule}: ${error.message}`);
        continue;
      }
      previous.delete(file);
      const document = documents.get(file);
      if (document !== undefined && document.version !== versions.get(file)) {
        // Changed while the run went on: the check of that change shows it.
        continue;
      }
      publish(file, result.errors, document === undefined ? undefined : toLines(document.text));
    }
    acrossFiles = across;
    for (const file of previous) {
      // Gone, or ignored now: nothing to show for it.
      if (!documents.has(file) || !isChecked(file)) publish(file, [], undefined);
    }
  };

  const runWorkspace = (): Promise<void> => {
    if (workspaceRun !== undefined) {
      workspaceAgain = true;
      return workspaceRun;
    }
    workspaceRun = (async () => {
      do {
        workspaceAgain = false;
        try {
          await checkWorkspace();
        } catch (thrown) {
          log(`Checking the workspace failed: ${thrown instanceof Error ? (thrown.stack ?? thrown.message) : String(thrown)}`);
        }
      } while (workspaceAgain && !shuttingDown);
    })().finally(() => {
      workspaceRun = undefined;
    });
    return workspaceRun;
  };

  const scheduleWorkspace = (wait = settleMs): void => {
    clearTimeout(workspaceTimer);
    workspaceTimer = setTimeout(() => void runWorkspace(), wait);
  };

  /** Checks one file as it stands in the editor, or on disk once closed. */
  const checkFile = async (file: string): Promise<void> => {
    if (settings === undefined || rules === undefined) return;
    const document = documents.get(file);
    if (!isChecked(file)) {
      publish(file, [], undefined);
      return;
    }
    if (document === undefined && !fs.existsSync(file)) {
      publish(file, [], undefined);
      return;
    }
    const startedAt = document?.version;
    // The rules looking across files are switched off for a run of one file,
    // and what they found last time is shown in their place.
    const configuration: Configuration = {...settings.configuration};
    for (const name of acrossFileRules) configuration[name] = 'off';
    const results = await lint([file], configuration, rules, {
      language: settings.language,
      ...(document === undefined ? {} : {contents: new Map([[file, document.text]])}),
    });
    const now = documents.get(file);
    if (now?.version !== startedAt) {
      return;
    }
    const own = results.flatMap((result) => result.errors);
    const errors = sortBy([...own, ...(acrossFiles.get(file) ?? [])], (error) => error.line);
    publish(file, errors, document === undefined ? undefined : toLines(document.text));
  };

  const fileTimers = new Map<string, NodeJS.Timeout>();
  const scheduleFile = (file: string, wait: number): void => {
    clearTimeout(fileTimers.get(file));
    fileTimers.set(
      file,
      setTimeout(() => {
        fileTimers.delete(file);
        checkFile(file).catch((thrown: unknown) => {
          log(`Checking "${file}" failed: ${thrown instanceof Error ? (thrown.stack ?? thrown.message) : String(thrown)}`);
        });
      }, wait),
    );
  };

  /** The files to watch on disk, for a client that watches them for us. */
  const watchersFor = (): FileSystemWatcher[] => {
    const list: FileSystemWatcher[] = [
      {globPattern: '**/*.feature'},
      {globPattern: '**/.gurkencheckrc'},
      {globPattern: '**/.gurkencheckignore'},
    ];
    if (watchers.relative) {
      // A file the configuration extends may be called anything, anywhere.
      for (const file of settings?.files ?? []) {
        const absolute = path.resolve(file);
        if (path.basename(absolute) === '.gurkencheckrc') continue;
        list.push({globPattern: {baseUri: pathToFileURL(path.dirname(absolute)).href, pattern: path.basename(absolute)}});
      }
    }
    return list;
  };

  const ready = (): void => {
    if (!initialized) {
      throw new ResponseError(ErrorCodes.ServerNotInitialized, 'The server has not been initialized');
    }
  };

  connection.onRequest('initialize', async (raw) => {
    const params = (raw ?? {}) as InitializeParams;
    const folder =
      params.workspaceFolders?.[0]?.uri ?? params.rootUri ?? (params.rootPath ? pathToFileURL(params.rootPath).href : undefined);
    const folderPath = folder === undefined ? undefined : toPath(folder);
    if (folderPath !== undefined && folderPath !== process.cwd()) {
      try {
        process.chdir(folderPath);
      } catch (thrown) {
        log(`Could not change to the workspace folder "${folderPath}": ${reasonOf(thrown)}`);
      }
    }
    root = process.cwd();
    if ((params.workspaceFolders?.length ?? 0) > 1) {
      log(`Serving the first workspace folder, "${root}", only: a server serves one folder.`);
    }
    const watch = params.capabilities?.workspace?.didChangeWatchedFiles;
    watchers = {dynamic: watch?.dynamicRegistration === true, relative: watch?.relativePatternSupport === true};

    try {
      rules = await loadRules(options.rulesdirs ?? []);
    } catch (thrown) {
      tell(reasonOf(thrown));
    }
    initialized = true;
    return {
      capabilities: {
        positionEncoding: 'utf-16',
        textDocumentSync: {openClose: true, change: TextDocumentSyncKind.Full, save: {includeText: false}},
        codeActionProvider: {codeActionKinds: ['quickfix']},
      },
      serverInfo: {name: 'gurkencheck', version: version()},
    };
  });

  connection.onNotification('initialized', () => {
    void runWorkspace().then(() => {
      if (watchers.dynamic && !shuttingDown) {
        connection
          .request('client/registerCapability', {
            registrations: [
              {
                id: 'gurkencheck-watched-files',
                method: 'workspace/didChangeWatchedFiles',
                registerOptions: {watchers: watchersFor()},
              },
            ],
          })
          .catch((thrown: unknown) => log(`The client would not watch files: ${reasonOf(thrown)}`));
      }
    });
  });

  connection.onNotification('textDocument/didOpen', (raw) => {
    const {textDocument} = raw as DidOpenParams;
    const file = toPath(textDocument.uri);
    if (file === undefined) return;
    documents.set(file, {uri: textDocument.uri, version: textDocument.version, text: textDocument.text});
    // Checked straight away: opening is not typing.
    if (settings !== undefined) scheduleFile(file, 0);
  });

  connection.onNotification('textDocument/didChange', (raw) => {
    const {textDocument, contentChanges} = raw as DidChangeParams;
    const file = toPath(textDocument.uri);
    const document = file === undefined ? undefined : documents.get(file);
    const change = contentChanges.at(-1);
    if (file === undefined || document === undefined || change === undefined) return;
    if (change.range !== undefined) {
      // The server asks for whole documents; a change to part of one cannot
      // be applied to text it no longer has the right version of.
      log(`Ignored a change to part of "${file}": the server takes whole documents.`);
      return;
    }
    document.version = textDocument.version;
    document.text = change.text;
    scheduleFile(file, settleMs);
    // A duplicate renamed away is gone once typing stops, not once saved.
    if (acrossFileRules.size > 0) scheduleWorkspace(settleMs * PAUSE_FACTOR);
  });

  connection.onNotification('textDocument/didSave', () => {
    scheduleWorkspace();
  });

  connection.onNotification('textDocument/didClose', (raw) => {
    const {textDocument} = raw as DocumentParams;
    const file = toPath(textDocument.uri);
    if (file === undefined || !documents.delete(file)) return;
    // What is on disk is what counts again - which is not what the editor
    // showed, if the changes were thrown away.
    scheduleFile(file, 0);
  });

  connection.onNotification('workspace/didChangeWatchedFiles', () => {
    scheduleWorkspace();
  });

  connection.onRequest('textDocument/codeAction', (raw): CodeAction[] => {
    ready();
    const params = raw as CodeActionParams;
    const only = params.context.only;
    if (only !== undefined && !only.some((kind) => kind === 'quickfix' || 'quickfix'.startsWith(`${kind}.`) || kind === '')) {
      return [];
    }
    const file = toPath(params.textDocument.uri);
    if (file === undefined) return [];
    const entries = shown.get(file) ?? [];
    const asked = entries.filter(({diagnostic}) =>
      params.context.diagnostics.some(
        (given) =>
          given.code === diagnostic.code &&
          given.message === diagnostic.message &&
          given.range.start.line === diagnostic.range.start.line,
      ),
    );
    if (asked.length === 0) return [];
    const text = documents.get(file)?.text ?? readText(file);
    return codeActionsFor(params.textDocument.uri, text, asked, settings?.language);
  });

  connection.onRequest('shutdown', () => {
    shuttingDown = true;
    clearTimeout(workspaceTimer);
    for (const timer of fileTimers.values()) clearTimeout(timer);
    return null;
  });

  return new Promise((resolve) => {
    const stop = (code: number): void => {
      clearTimeout(workspaceTimer);
      for (const timer of fileTimers.values()) clearTimeout(timer);
      resolve(code);
    };
    connection.onNotification('exit', () => stop(shuttingDown ? 0 : 1));
    // The client going away without a word is an exit without a shutdown.
    void connection.closed.then(() => stop(shuttingDown ? 0 : 1));
  });
}
