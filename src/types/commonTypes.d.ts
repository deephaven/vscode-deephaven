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
      url: string;
      consoleType?: ConsoleType;
    };

export interface CoreConnectionConfig {
  url: URL;
  consoleType: ConsoleType;
}

export type EnterpriseConnectionConfigStored = string;

export interface EnterpriseConnectionConfig {
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
