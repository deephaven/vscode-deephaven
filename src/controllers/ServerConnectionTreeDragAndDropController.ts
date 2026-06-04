import { MIME_TYPE } from '../common';
import { getEditorForUri, isServerStateNode } from '../util';
import type { IServerManager } from '../types';
import type { ServerConnectionNode } from '../types/treeViewTypes';

import * as vscode from 'vscode';

/**
 * Drag and drop controller for the server connection tree view.
 */
export class ServerConnectionTreeDragAndDropController
  implements vscode.TreeDragAndDropController<ServerConnectionNode>
{
  constructor(readonly serverManager: IServerManager) {}

  dropMimeTypes: readonly string[] = [MIME_TYPE.uriList];
  dragMimeTypes: readonly string[] = [MIME_TYPE.uriList];

  handleDrop = async (
    target: ServerConnectionNode | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void> => {
    // Only target connection nodes. DHE server group nodes and uri leaf nodes
    // are not valid editor-connection targets.
    if (
      target == null ||
      target instanceof vscode.Uri ||
      isServerStateNode(target)
    ) {
      return;
    }

    const transferItem = dataTransfer.get(MIME_TYPE.uriList);
    if (transferItem == null) {
      return;
    }

    const uri = vscode.Uri.parse(transferItem.value);
    const editor = await getEditorForUri(uri);

    try {
      await this.serverManager.setEditorConnection(
        editor.document.uri,
        editor.document.languageId,
        target
      );
    } catch {}
  };
}
