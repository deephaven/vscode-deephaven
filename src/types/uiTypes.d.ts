import * as vscode from 'vscode';
import type { ServerConnection, ServerState } from './commonTypes';

export type SeparatorPickItem = {
  label: string;
  kind: vscode.QuickPickItemKind.Separator;
};

export type ConnectionPickItem<TType, TData> = vscode.QuickPickItem & {
  type: TType;
  data: TData;
};

export type ConnectionPickOption<TConnection extends ServerConnection> =
  | SeparatorPickItem
  | ConnectionPickItem<'server', ServerState>
  | ConnectionPickItem<'connection', TConnection>;
