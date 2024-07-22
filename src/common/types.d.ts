export type ConnectionType = 'DHC';

export type ConnectionAndSession<TConnection, TSession> = {
  cn: TConnection;
  session: TSession;
};

export type ConsoleType = 'groovy' | 'python';

export interface ConnectionConfig {
  url: string;
  consoleType: ConsoleType;
}

export type ConnectionConfigStored =
  | string
  | {
      url: string;
      consoleType?: ConsoleType;
    };

export interface Disposable {
  dispose(): Promise<void>;
}
