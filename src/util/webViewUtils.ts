import * as vscode from 'vscode';
import { EXTENSION_ID, type ViewID } from '../common';

/**
 * Get Uri root containing content for a WebView.
 * @param extensionUri The extension Uri.
 * @param viewId The view id to get the content for.
 * @returns A Uri to the content root.
 */
export function getWebViewContentRootUri(
  extensionUri: vscode.Uri,
  viewId: ViewID
): vscode.Uri {
  return vscode.Uri.joinPath(
    extensionUri,
    'out',
    'webViews',
    viewId.replace(`${EXTENSION_ID}.`, '')
  );
}
