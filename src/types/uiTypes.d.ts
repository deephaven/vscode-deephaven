import * as vscode from 'vscode';
import type {
  AuthenticationMethod,
  ConnectionState,
  ServerState,
  Username,
} from './commonTypes';

export type SeparatorPickItem = {
  label: string;
  kind: vscode.QuickPickItemKind.Separator;
};

export type AuthenticationMethodPickItem =
  | {
      label: 'Username / Password';
      type: 'password';
      iconPath: vscode.ThemeIcon;
    }
  | {
      label: Username;
      type: 'privateKey';
      iconPath: vscode.ThemeIcon;
    };

export type ConnectionPickItem<TType, TData> = vscode.QuickPickItem & {
  type: TType;
  data: TData;
};

export type ConnectionPickOption<TConnection extends ConnectionState> =
  | SeparatorPickItem
  | ConnectionPickItem<'server', ServerState>
  | ConnectionPickItem<'connection', TConnection>;
