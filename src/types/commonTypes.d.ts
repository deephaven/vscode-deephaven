import * as vscode from 'vscode';

export type ConnectionType = 'DHC';

export type ConnectionAndSession<TConnection, TSession> = {
  cn: TConnection;
  session: TSession;
};

export type ConsoleType = 'groovy' | 'python';

export type CoreConnectionConfigStored =
  | string
  | {
      label?: string;
      url: string;
    };

export interface CoreConnectionConfig {
  label?: string;
  url: URL;
}

export type EnterpriseConnectionConfigStored = string;

export interface EnterpriseConnectionConfig {
  label?: string;
  url: URL;
}

export interface Disposable {
  dispose(): Promise<void>;
}

export type EventListenerT = <TEvent>(event: TEvent) => void;
export type UnsubscribeEventListener = () => void;

export type ServerType = 'DHC' | 'DHE';

export interface ServerState {
  type: ServerType;
  url: URL;
  label?: string;
  isRunning?: boolean;
}

export type SeparatorPickItem = {
  label: string;
  kind: vscode.QuickPickItemKind.Separator;
};

export type ConnectionPickItem<TType, TData> = vscode.QuickPickItem & {
  type: TType;
  data: TData;
};