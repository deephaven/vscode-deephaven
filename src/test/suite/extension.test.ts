import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { SELECT_CONNECTION_COMMAND } from '../../common';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
  test('can open connection selector', () => {
    // This is probably better tested in an e2e test, but it's at least an
    // example of how we can make use of `vscode` apis in integration tests
    // until we get some better precedence in place. Namely, there doesn't seem
    // to be a straightforward way to assert it actually succeeded except that
    // it didn't throw an error.
    vscode.commands.executeCommand(SELECT_CONNECTION_COMMAND);
  });
});
