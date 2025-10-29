import * as vscode from 'vscode';

export interface RemoteImportSourceTreeRootElement {
  name: string;
  type: 'root';
}

export interface RemoteImportSourceTreeWkspRootFolderElement {
  name: string;
  type: 'workspaceRootFolder';
  uri: vscode.Uri;
}

export interface RemoteImportSourceTreeTopLevelMarkedFolderElement {
  name: string;
  type: 'topLevelMarkedFolder';
  isMarked: true;
  uri: vscode.Uri;
}

export interface RemoteImportSourceTreeFileElement {
  name: string;
  type: 'file';
  isMarked: boolean;
  uri: vscode.Uri;
}

export interface RemoteImportSourceTreeFolderElement {
  name: string;
  type: 'folder';
  isMarked: boolean;
  uri: vscode.Uri;
}

export type RemoteImportSourceTreeElement =
  | RemoteImportSourceTreeRootElement
  | RemoteImportSourceTreeTopLevelMarkedFolderElement
  | RemoteImportSourceTreeWkspRootFolderElement
  | RemoteImportSourceTreeFileElement
  | RemoteImportSourceTreeFolderElement;

export interface RemoteImportSourceTreeView
  extends vscode.TreeView<RemoteImportSourceTreeElement> {}
