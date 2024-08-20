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
  url: string;
  consoleType: ConsoleType;
}

export type EnterpriseConnectionConfigStored = string;

export interface EnterpriseConnectionConfig {
  url: string;
}

export interface Disposable {
  dispose(): Promise<void>;
}

export type ServerType = 'DHC' | 'DHE';

export interface ServerState {
  type: ServerType;
  url: string;
  isRunning?: boolean;
}
