import type { Brand } from '../shared';
import type { UniqueID } from './commonTypes';

export type ModuleFullname = Brand<'ModuleFullname', string>;

interface JsonRpcRequestBase {
  jsonrpc: '2.0';
  id: string;
}

export interface JsonRpcFetchModuleRequest extends JsonRpcRequestBase {
  method: 'fetch_module';
  params: { module_name: ModuleFullname };
}

export interface JsonRpcSetConnectionIdRequest extends JsonRpcRequestBase {
  method: 'set_connection_id';
}

export type JsonRpcRequest =
  | JsonRpcFetchModuleRequest
  | JsonRpcSetConnectionIdRequest;

export interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: string;
  result: unknown;
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
