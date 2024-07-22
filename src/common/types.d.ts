export type ConnectionType = 'DHC';

export type ConnectionAndSession<TConnection, TSession> = {
  cn: TConnection;
  session: TSession;
};

export interface ConnectionConfig {
  url: string;
  consoleType: 'groovy' | 'python';
}

export type ConnectionConfigStored =
  | string
  | {
      url: string;
      consoleType?: 'groovy' | 'python';
    };

export interface Disposable {
  dispose(): Promise<void>;
}
