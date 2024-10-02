import * as vscode from 'vscode';
import type { ConnectionState, ServerState } from './commonTypes';

export type SeparatorPickItem = {
  label: string;
  kind: vscode.QuickPickItemKind.Separator;
};

export type ConnectionPickItem<TType, TData> = vscode.QuickPickItem & {
  type: TType;
  data: TData;
};

export type ConnectionPickOption<TConnection extends ConnectionState> =
  | SeparatorPickItem
  | ConnectionPickItem<'server', ServerState>
  | ConnectionPickItem<'connection', TConnection>;
