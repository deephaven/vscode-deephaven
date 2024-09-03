import * as vscode from 'vscode';

// Branded type helpers
declare const __brand: unique symbol;
export type Brand<T extends string, TBase = string> = TBase & {
  readonly [__brand]: T;
};

export type Port = Brand<'Port', number>;

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

export type EnterpriseConnectionConfigStored =
  Brand<'EnterpriseConnectionConfigStored'>;

export interface EnterpriseConnectionConfig {
  label?: string;
  url: URL;
}

export type ServerConnectionConfig =
  | CoreConnectionConfig
  | EnterpriseConnectionConfig
  | URL;

export interface ServerConnection {
  readonly serverUrl: URL;
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
  isManaged?: boolean;
  isRunning?: boolean;
}
