import { z } from 'zod';
import type { IServerManager, IDhcService } from '../../types';
import { execConnectToServer } from '../../common/commands';
import { DhcService } from '../../services';
import { isInstanceOf } from '../../util';
import { createConnectionNotFoundHint } from './runCodeUtils';

/**
 * MCP tool result with standardized structure following Model Context Protocol.
 * Includes both text content (JSON stringified) and structured content for AI assistants.
 *
 * The structured content has a standardized top-level shape:
 * - success: boolean indicating operation outcome
 * - message: human-readable description of the result
 * - executionTimeMs: measured execution time
 * - hint: optional guidance for resolving errors or next steps
 * - details: optional tool-specific data
 *
 * @template TSuccess Boolean literal type for success field (true | false).
 * @template TDetails Type of tool-specific details object.
 */
export type McpToolResult<TSuccess extends boolean, TDetails = unknown> = {
  content: [{ type: 'text'; text: string }];
  structuredContent: {
    success: TSuccess;
    message: string;
    executionTimeMs: number;
    hint?: string;
    details?: TDetails;
  };
};

/**
 * Creates a standardized MCP tool output schema.
 *
 * All MCP tools return a consistent structure with success status, message,
 * execution time, optional hint, and optional tool-specific details.
 *
 * @param detailsSchema Optional Zod schema for tool-specific details.
 * @returns Output schema object for use in tool spec.
 *
 * @example
 * ```typescript
 * // Simple tool with no details
 * const spec = {
 *   title: 'My Tool',
 *   description: 'Does something',
 *   inputSchema: { ... },
 *   outputSchema: createMcpToolOutputSchema(),
 * };
 *
 * // Tool with typed details
 * const spec = {
 *   title: 'My Tool',
 *   description: 'Does something',
 *   inputSchema: { ... },
 *   outputSchema: createMcpToolOutputSchema({
 *     count: z.number(),
 *     items: z.array(z.string()),
 *   }),
 * };
 * ```
 */
export function createMcpToolOutputSchema<TDetailsShape extends z.ZodRawShape>(
  detailsShape?: TDetailsShape
): {
  success: z.ZodBoolean;
  message: z.ZodString;
  executionTimeMs: z.ZodNumber;
  hint: z.ZodOptional<z.ZodString>;
  details?: z.ZodOptional<z.ZodObject<TDetailsShape>>;
} {
  return {
    success: z.boolean(),
    message: z.string(),
    executionTimeMs: z.number().describe('Execution time in milliseconds'),
    hint: z.string().optional(),
    ...(detailsShape ? { details: z.object(detailsShape).optional() } : {}),
  };
}

/**
 * Formats an error message by optionally appending error details.
 *
 * @param errorMessage Primary error message.
 * @param error Optional Error object or string to append to the message.
 * @returns The error message, optionally with error details appended.
 */
export function formatErrorMessage(
  errorMessage: string,
  error?: unknown
): string {
  if (error == null) {
    return errorMessage;
  }

  const errorDetail = error instanceof Error ? error.message : String(error);
  return `${errorMessage}: ${errorDetail}`;
}

/**
 * Creates an MCP tool result conforming to the Model Context Protocol.
 *
 * Generates both text content (JSON stringified) and structured content for AI
 * assistants. The result follows a standardized format with success status,
 * message, execution time, optional hint, and optional tool-specific details.
 *
 * @param success Whether the operation succeeded.
 * @param message Human-readable description of the result.
 * @param executionTimeMs Measured execution time in milliseconds.
 * @param hint Optional guidance for resolving errors or next steps.
 * @param details Optional tool-specific data (e.g., results, context).
 * @returns MCP tool result with text and structured content.
 */
function mcpToolResult<TSuccess extends boolean, TDetails = unknown>(
  success: TSuccess,
  message: string,
  executionTimeMs: number,
  hint?: string,
  details?: TDetails
): McpToolResult<TSuccess, TDetails> {
  const structuredContent = {
    success,
    message,
    executionTimeMs,
    ...(hint == null ? undefined : { hint }),
    ...(details == null ? undefined : { details }),
  };

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(structuredContent),
      },
    ],
    structuredContent,
  };
}

/**
 * Helper class for creating MCP tool responses with automatic execution time tracking.
 *
 * Instantiate at the start of a tool handler, perform work, then call one of the
 * success or error methods to generate a properly formatted MCP response with
 * measured execution time.
 *
 * @example
 * ```typescript
 * async function myToolHandler(args) {
 *   const response = new McpToolResponse();
 *   try {
 *     const result = await performWork(args);
 *     return response.success('Operation completed', { data: result });
 *   } catch (error) {
 *     return response.error('Operation failed', { error: error.message });
 *   }
 * }
 * ```
 */
export class McpToolResponse {
  private startTimeMs: number;

  constructor() {
    this.startTimeMs = performance.now();
  }

  /**
   * Gets the elapsed time in milliseconds since this response object was created.
   *
   * @returns Elapsed time in milliseconds.
   */
  getElapsedTimeMs(): number {
    return performance.now() - this.startTimeMs;
  }

  /**
   * Creates a successful MCP tool result.
   *
   * Automatically calculates and includes execution time from when the
   * McpToolResponse instance was created.
   *
   * @param message Success message describing what was accomplished.
   * @param details Optional tool-specific result data.
   * @returns MCP tool result with success=true and measured execution time.
   */
  success<TDetails = unknown>(
    message: string,
    details?: TDetails
  ): McpToolResult<true, TDetails> {
    return this.successWithHint(message, undefined, details);
  }

  /**
   * Creates a successful MCP tool result with guidance hint.
   *
   * Automatically calculates and includes execution time from when the
   * McpToolResponse instance was created.
   *
   * @param message Success message describing what was accomplished.
   * @param hint Optional guidance for next steps or additional context.
   * @param details Optional tool-specific result data.
   * @returns MCP tool result with success=true, hint, and measured execution time.
   */
  successWithHint<TDetails = unknown>(
    message: string,
    hint?: string,
    details?: TDetails
  ): McpToolResult<true, TDetails> {
    return mcpToolResult(true, message, this.getElapsedTimeMs(), hint, details);
  }

  /**
   * Creates an error MCP tool result.
   *
   * Automatically calculates and includes execution time from when the
   * McpToolResponse instance was created. If an error object or string is provided,
   * it will be appended to the error message for additional context.
   *
   * @param errorMessage Primary error message describing what went wrong.
   * @param error Optional Error object or string to append to the message.
   * @param details Optional contextual data (e.g., partial results, stack traces, error context).
   * @returns MCP tool result with success=false and measured execution time.
   */
  error<TDetails = unknown>(
    errorMessage: string,
    error?: unknown,
    details?: TDetails
  ): McpToolResult<false, TDetails> {
    return this.errorWithHint(errorMessage, error, undefined, details);
  }

  /**
   * Creates an error MCP tool result with guidance hint.
   *
   * Automatically calculates and includes execution time from when the
   * McpToolResponse instance was created. If an error object or string is provided,
   * it will be appended to the error message for additional context.
   *
   * @param errorMessage Primary error message describing what went wrong.
   * @param error Optional Error object or string to append to the message.
   * @param hint Optional guidance for resolving the error or suggestions for next steps.
   * @param details Optional contextual data (e.g., partial results, stack traces, error context).
   * @returns MCP tool result with success=false, hint, and measured execution time.
   */
  errorWithHint<TDetails = unknown>(
    errorMessage: string,
    error?: unknown,
    hint?: string,
    details?: TDetails
  ): McpToolResult<false, TDetails> {
    return mcpToolResult(
      false,
      formatErrorMessage(errorMessage, error),
      this.getElapsedTimeMs(),
      hint,
      details
    );
  }
}

/**
 * Gets the panel URL format for DHC servers.
 * DHC servers use iframe format.
 *
 * @param serverUrl The server URL to use for the panel URL origin.
 * @returns The panel URL format for DHC servers.
 */
export function getDhcPanelUrlFormat(serverUrl: URL): string {
  return `${serverUrl.origin}/iframe/widget/?name=<variableTitle>`;
}

/**
 * Gets the panel URL format for DHE servers.
 * DHE servers use iriside format with serial ID.
 *
 * @param serverUrl The server URL to use for the panel URL origin.
 * @param connectionUrl The connection URL to get worker info for.
 * @param serverManager The server manager to query for DHE service and worker info.
 * @returns The panel URL format for DHE servers, or undefined if serial is not available.
 */
export async function getDhePanelUrlFormat(
  serverUrl: URL,
  connectionUrl: URL,
  serverManager: IServerManager
): Promise<string | undefined> {
  const dheService = await serverManager.getDheServiceForWorker(connectionUrl);

  const features = dheService?.getServerFeatures()?.features;
  if (features?.embedDashboardsAndWidgets !== true) {
    return undefined;
  }

  // Get worker info for DHE servers to include serial ID in panel URLs
  const workerInfo = await serverManager.getWorkerInfo(connectionUrl);
  if (workerInfo == null) {
    return undefined;
  }

  return `${serverUrl.origin}/iriside/embed/widget/serial/${workerInfo.serial}/<variableTitle>`;
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
export function getServerMatchPortIfLocalHost<T>(
  serverManager: { getServer: (url: URL, matchPort?: boolean) => T },
  url: URL
): T {
  const matchPort =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  return serverManager.getServer(url, matchPort);
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
        ? getDhcPanelUrlFormat(server.url)
        : undefined;

  return {
    success: true,
    connection,
    panelUrlFormat,
  };
}
