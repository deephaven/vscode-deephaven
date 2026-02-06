import { z } from 'zod';
import type {
  ConnectionState,
  IDhcService,
  IServerManager,
  ServerState,
} from '../../types';
import { execConnectToServer } from '../../common/commands';
import { DhcService } from '../../services';
import { isInstanceOf } from '../../util';
import { getDhcPanelUrlFormat, getDhePanelUrlFormat } from './panelUtils';
import { createConnectionNotFoundHint } from './runCodeUtils';

export const connectionResultSchema = z.object({
  isConnected: z.boolean(),
  isRunningCode: z.boolean().optional(),
  serverUrl: z.string(),
  tagId: z.string().optional(),
});

export const serverResultSchema = z.object({
  type: z.string(),
  connectionCount: z.number(),
  connections: z.array(connectionResultSchema).optional(),
  isConnected: z.boolean(),
  isManaged: z.boolean().optional(),
  isRunning: z.boolean(),
  label: z.string().optional(),
  tags: z.array(z.string()).optional(),
  url: z.string(),
});

export type ConnectionResult = z.infer<typeof connectionResultSchema>;
export type ServerResult = z.infer<typeof serverResultSchema>;

/**
 * Maps a ConnectionState to a connection result object.
 */
export function connectionToResult({
  isConnected,
  isRunningCode,
  serverUrl,
  tagId,
}: ConnectionState): ConnectionResult {
  return {
    isConnected,
    isRunningCode,
    serverUrl: serverUrl.toString(),
    tagId,
  };
}

type GetFirstConnectionOrCreateSuccess = {
  success: true;
  connection: IDhcService;
  panelUrlFormat: string | undefined;
};

type GetFirstConnectionOrCreateError = {
  success: false;
  errorMessage: string;
  error?: unknown;
  hint?: string;
  details?: Record<string, unknown>;
};

type GetFirstConnectionOrCreateResult =
  | GetFirstConnectionOrCreateSuccess
  | GetFirstConnectionOrCreateError;

/**
 * Gets the first connection for a given URL, handling server retrieval,
 * connection creation, and panel URL format generation.
 *
 * This function encapsulates the common pattern of:
 * 1. Getting the server with getServerMatchPortIfLocalHost
 * 2. Validating the server exists and is running
 * 3. Getting or creating a connection (auto-connecting for DHC servers)
 * 4. Returning the first connection and panel URL format
 *
 * @param params Configuration for getting the connection
 * @param params.serverManager The server manager to query
 * @param params.connectionUrl The connection URL
 * @param params.languageId Optional language ID for creating connection hints
 * @returns Success with connection and panelUrlFormat, or error with message and hint
 */
export async function getFirstConnectionOrCreate(params: {
  serverManager: IServerManager;
  connectionUrl: URL;
  languageId?: string;
}): Promise<GetFirstConnectionOrCreateResult> {
  const { serverManager, connectionUrl, languageId } = params;

  // Get server with matchPort logic
  const server = getServerMatchPortIfLocalHost(serverManager, connectionUrl);

  if (server == null) {
    const hint = languageId
      ? await createConnectionNotFoundHint(
          serverManager,
          connectionUrl.href,
          languageId
        )
      : undefined;

    return {
      success: false,
      errorMessage: 'No connections or server found',
      hint,
      details: { connectionUrl: connectionUrl.href },
    };
  }

  // Check if server is running
  if (!server.isRunning) {
    return {
      success: false,
      errorMessage: 'Server is not running',
      details: { connectionUrl: connectionUrl.href },
    };
  }

  // Get existing connections
  let connections = serverManager.getConnections(connectionUrl);

  if (connections.length === 0) {
    // Only Core workers can be connected to if we don't already have a connection
    if (server.type !== 'DHC') {
      return {
        success: false,
        errorMessage: 'No active connection',
        hint: 'Use connectToServer first',
        details: { connectionUrl: connectionUrl.href },
      };
    }

    await execConnectToServer({ type: server.type, url: server.url });
    connections = serverManager.getConnections(connectionUrl);

    if (connections.length === 0) {
      return {
        success: false,
        errorMessage: 'Failed to connect to server',
        details: { connectionUrl: connectionUrl.href },
      };
    }
  }

  const [connection] = connections;

  // There shouldn't really be a case where the connection is not a
  // DhcService, but this is consistent with how we check connections
  // elsewhere in order to narrow the type.
  if (!isInstanceOf(connection, DhcService)) {
    return {
      success: false,
      errorMessage: 'Connection is not a Core / Core+ connection.',
      details: { connectionUrl: connectionUrl.href },
    };
  }

  const panelUrlFormat =
    server.type === 'DHE'
      ? await getDhePanelUrlFormat(server.url, connectionUrl, serverManager)
      : server.type === 'DHC'
        ? getDhcPanelUrlFormat(server.url, await connection.getPsk())
        : undefined;

  return {
    success: true,
    connection,
    panelUrlFormat,
  };
}

/**
 * Gets a server from the server manager, matching port for localhost connections.
 * For localhost servers, different ports mean different servers, so port is
 * included in the match. For remote servers, different ports on the same
 * hostname are the same server, so port is ignored in the match.
 *
 * @param serverManager The server manager to query for the server.
 * @param url The connection URL to match against.
 * @returns The server if found, null otherwise.
 */
export function getServerMatchPortIfLocalHost(
  serverManager: IServerManager,
  url: URL
): ServerState | undefined {
  const matchPort =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  return serverManager.getServer(url, matchPort);
}

/**
 * Maps a ServerState to a server result object with connections.
 */
export function serverToResult(
  {
    type,
    connectionCount,
    isConnected,
    isManaged,
    isRunning,
    label,
    url,
  }: ServerState,
  connections: ConnectionState[]
): ServerResult {
  return {
    type,
    connectionCount,
    isConnected,
    isManaged,
    isRunning,
    label,
    tags: isManaged ? ['pip', 'managed'] : [],
    url: url.toString(),
    connections: connections.map(connectionToResult),
  };
}
