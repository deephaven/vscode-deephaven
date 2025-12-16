import type { Brand } from '../shared';

export type Include<T> = { value: T; include?: boolean };

export type FilePattern = `**/*.${string}`;
export type FolderName = Brand<'FolderName', string>;
export type GroovyPackageName = Brand<'GroovyPackageName', string>;
export type GroovyResourceName = Brand<'GroovyResourceName', string>;
export type PythonModuleFullname = Brand<'ModuleFullname', string>;
export type RelativeWsUriString = Brand<'RelativeWsUriString', string>;

interface JsonRpcRequestBase {
  jsonrpc: '2.0';
  id: string;
}

export interface JsonRpcFetchModuleRequest extends JsonRpcRequestBase {
  method: 'fetch_module';
  // eslint-disable-next-line @typescript-eslint/naming-convention
  params: { module_name: PythonModuleFullname };
}

export interface JsonRpcSetConnectionIdRequest extends JsonRpcRequestBase {
  method: 'set_connection_id';
}

export type JsonRpcRequest =
  | JsonRpcFetchModuleRequest
  | JsonRpcSetConnectionIdRequest;

export interface JsonRpcSuccess<TResult = unknown> {
  jsonrpc: '2.0';
  id: string;
  result: TResult;
}

export interface JsonRpcError {
  jsonrpc: '2.0';
  id: string;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

export interface PythonRegularPackageSpecData {
  name: PythonModuleFullname;
  isPackage: true;
  origin: string;
  subModuleSearchLocations: string[];
}

export interface PythonNamespacePackageSpecData {
  name: PythonModuleFullname;
  isPackage: true;
  subModuleSearchLocations: string[];

  // makes it easier to spread the `PythonModuleSpecData` union type
  origin?: never;
}

export interface PythonRegularModuleSpecData {
  name: PythonModuleFullname;
  isPackage: false;
  origin: string;

  // makes it easier to spread the `PythonModuleSpecData` union type
  subModuleSearchLocations?: never;
}

export type PythonModuleSpecData =
  | PythonRegularPackageSpecData
  | PythonNamespacePackageSpecData
  | PythonRegularModuleSpecData;

export interface PythonModuleSpecDataResult {
  name: PythonModuleFullname;
  origin?: string;
  /* eslint-disable @typescript-eslint/naming-convention */
  is_package: boolean;
  submodule_search_locations?: string[];
  /* eslint-enable @typescript-eslint/naming-convention */
  source?: string;
}
