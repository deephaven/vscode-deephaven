import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { SELECT_CONNECTION_COMMAND } from '../../common';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
  test('can open connection selector', () => {
    // I originally set this up based on the `vscode` extension docs, but I'm
    // inclined to remove it since `wdio-vscode-service` seems to be able to
    // do all of this and more. For example, there's not a straightforward way
    // to verify that this succeeded other than it didn't throw an error.
    // See https://github.com/webdriverio-community/wdio-vscode-service/issues/129
    vscode.commands.executeCommand(SELECT_CONNECTION_COMMAND);
  });
});
