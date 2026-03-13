import type {
  JsonRpcError,
  JsonRpcSetConnectionIdRequest,
  JsonRpcSuccess,
  PythonModuleFullname,
  PythonModuleSpecData,
  PythonModuleSpecDataResult,
  UniqueID,
} from '../types';

/**
 * Create a JSON-RPC success response for a Python module spec data request.
 * @param id The request ID.
 * @param spec The Python module spec data.
 * @param source Optional source code of the module.
 * @returns The JSON-RPC success response.
 */
export function moduleSpecResponse(
  id: string,
  { name, isPackage, origin, subModuleSearchLocations }: PythonModuleSpecData,
  source?: string
): JsonRpcSuccess<PythonModuleSpecDataResult> {
  return {
    jsonrpc: '2.0',
    id,
    result: {
      name,
      origin,
      /* eslint-disable @typescript-eslint/naming-convention */
      is_package: isPackage,
      submodule_search_locations: subModuleSearchLocations,
      /* eslint-enable @typescript-eslint/naming-convention */
      source,
    },
  };
}

/**
 * Create a JSON-RPC error response for a Python module spec data request.
 * @param id The request ID.
 * @param moduleName The module name that errored.
 * @returns The JSON-RPC error response.
 */
export function moduleSpecErrorResponse(
  id: string,
  moduleName: PythonModuleFullname
): JsonRpcError {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: -32602, // Invalid params error code
      message: `Module not found: ${moduleName}`,
    },
  };
}

/**
 * Create a JSON-RPC request to set the connection ID.
 * @param cnId The connection ID to set.
 * @returns The JSON-RPC set connection ID request.
 */
export function setConnectionIdRequest(
  cnId: UniqueID
): JsonRpcSetConnectionIdRequest {
  return {
    jsonrpc: '2.0',
    id: cnId,
    method: 'set_connection_id',
  };
}
