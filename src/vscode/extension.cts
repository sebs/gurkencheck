/**
 * The VS Code extension's entry point, named by `main` in package.json.
 *
 * CommonJS, because that is what every VS Code release loads an extension
 * as, and the `vscode` module exists only for `require` inside one. The
 * client is the same ECMAScript module code as the rest of the package, so
 * this loads it and hands it the API.
 */
import type * as vscode from 'vscode';
import type {Client} from './client.ts';

const api = require('vscode') as typeof vscode;

let client: Client | undefined;

async function activate(context: vscode.ExtensionContext): Promise<void> {
  const {activate: start} = await import('./client.ts');
  client = start(api, context);
}

async function deactivate(): Promise<void> {
  await client?.deactivate();
  client = undefined;
}

module.exports = {activate, deactivate};
