import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';

// Branded type helpers
declare const __brand: unique symbol;
export type Brand<T extends string, TBase = string> = TBase & {
  readonly [__brand]: T;
};

export type Port = Brand<'Port', number>;

export type ConnectionType = 'DHC';

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

export interface ConnectionState {
  readonly isConnected: boolean;
  readonly serverUrl: URL;
}

export interface WorkerInfo {
  grpcUrl: string;
  ideUrl: string;
  processInfoId: string | null;
  serial: string;
  workerName: string | null;
}

export interface Disposable {
  dispose(): Promise<void>;
}

export type EventListenerT = <TEvent>(event: TEvent) => void;
export type UnsubscribeEventListener = () => void;

export type ServerType = 'DHC' | 'DHE';

export interface UnmanagedServerState {
  isManaged?: false;
}

export interface ManagedServerState {
  isManaged: true;
  psk: string;
}

export type ServerState = {
  type: ServerType;
  url: URL;
  label?: string;
  isRunning?: boolean;
} & (UnmanagedServerState | ManagedServerState);

export type VariableID = Brand<'VariableID'>;

export type VariableDefintion = DhcType.ide.VariableDefinition & {
  id: VariableID;
  type: VariableType;
};

export type VariableMap = Map<VariableID, VariableDefintion>;
export type VariablePanelMap = Map<VariableID, vscode.WebviewPanel>;

export interface VariableChanges {
  readonly created: VariableDefintion[];
  readonly removed: VariableDefintion[];
  readonly updated: VariableDefintion[];
}

export type VariableType =
  | 'deephaven.plot.express.DeephavenFigure'
  | 'deephaven.ui.Element'
  | 'Figure'
  | 'HierarchicalTable'
  | 'OtherWidget'
  | 'pandas.DataFrame'
  | 'PartitionedTable'
  | 'Table'
  | 'TableMap'
  | 'Treemap'
  | 'TreeTable';
