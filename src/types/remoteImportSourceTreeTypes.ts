import * as vscode from 'vscode';

export interface RemoteImportSourceTreeRootElement {
  name: string;
  type: 'root';
}

export interface RemoteImportSourceTreeWkspRootFolderElement {
  name: string;
  type: 'workspaceRootFolder';
  languageId: string;
  uri: vscode.Uri;
}

export interface RemoteImportSourceTreeTopLevelMarkedFolderElement {
  name: string;
  type: 'topLevelMarkedFolder';
  languageId: string;
  isMarked: true;
  uri: vscode.Uri;
}

export interface RemoteImportSourceTreeFileElement {
  name: string;
  type: 'file';
  languageId: string;
  isMarked: boolean;
  uri: vscode.Uri;
}

export interface RemoteImportSourceTreeFolderElement {
  name: string;
  type: 'folder';
  languageId: string;
  isMarked: boolean;
  uri: vscode.Uri;
}

export type RemoteImportSourceTreeElement =
  | RemoteImportSourceTreeRootElement
  | RemoteImportSourceTreeWkspRootFolderElement
  | RemoteImportSourceTreeTopLevelMarkedFolderElement
  | RemoteImportSourceTreeFileElement
  | RemoteImportSourceTreeFolderElement;

export interface RemoteImportSourceTreeView
  extends vscode.TreeView<RemoteImportSourceTreeElement> {}
