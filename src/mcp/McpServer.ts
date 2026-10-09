import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { toNodeHandler } from '@modelcontextprotocol/node';
import {
  createMcpHandler,
  hostHeaderValidationResponse,
  isLegacyRequest,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  McpServer as SdkMcpServer,
  originValidationResponse,
  WebStandardStreamableHTTPServerTransport,
  type McpHandlerRequestOptions,
  type McpHttpHandler,
  type ToolCallback,
} from '@modelcontextprotocol/server';
import * as http from 'http';
import type {
  IAsyncCacheService,
  IPanelService,
  IServerManager,
  McpTool,
  McpToolSpec,
  GroovyPackageName,
  PythonModuleFullname,
} from '../types';
import { MCP_SERVER_NAME } from '../common';
import {
  createAddRemoteFileSourcesTool,
  createGetColumnStatsTool,
  createGetLogsTool,
  createGetTableDataTool,
  createGetTableStatsTool,
  createListConnectionsTool,
  createListVariablesTool,
  createListRemoteFileSourcesTool,
  createListServersTool,
  createOpenFilesInEditorTool,
  createOpenVariablePanelsTool,
  createRemoveRemoteFileSourcesTool,
  createRunCodeFromUriTool,
  createRunCodeTool,
  createShowOutputPanelTool,
} from './tools';
import { Logger, OutputChannelWithHistory, withResolvers } from '../util';
import { DisposableBase, type FilteredWorkspace } from '../services';
import { createConnectToServerTool } from './tools/connectToServer';

const logger = new Logger('McpServer');

/**
 * MCP Server for Deephaven extension.
 * Provides tools for AI assistants (like GitHub Copilot) to interact with Deephaven.
 */
export class McpServer extends DisposableBase {
  private httpServer: http.Server | null = null;
  private port: number | null = null;

  /**
   * Serves 2026-07-28 (modern) protocol requests. 2025-era requests are routed
   * to `handleLegacyRequest` instead so that responses stay
   * `application/json` (`createMcpHandler`'s built-in legacy fallback always
   * responds with SSE).
   */
  private readonly modernHandler: McpHttpHandler;

  constructor(
    readonly coreJsApiCache: IAsyncCacheService<URL, typeof DhcType>,
    readonly outputChannel: OutputChannelWithHistory,
    readonly outputChannelDebug: OutputChannelWithHistory,
    readonly panelService: IPanelService,
    readonly groovyDiagnostics: vscode.DiagnosticCollection,
    readonly groovyWorkspace: FilteredWorkspace<GroovyPackageName>,
    readonly pythonDiagnostics: vscode.DiagnosticCollection,
    readonly pythonWorkspace: FilteredWorkspace<PythonModuleFullname>,
    readonly serverManager: IServerManager
  ) {
    super();

    this.modernHandler = createMcpHandler(this.createSdkServer, {
      legacy: 'reject',
      onerror: error => logger.error('MCP request error:', error),
    });
  }

  /**
   * Create a new SDK server with all tools registered. An SDK server can only
   * be connected to one transport at a time, so a fresh instance is created
   * for every HTTP request. This is what allows concurrent tool calls.
   */
  private createSdkServer = (): SdkMcpServer => {
    const server = new SdkMcpServer({
      name: MCP_SERVER_NAME,
      version: '1.0.0',
    });

    const registerTool = <Spec extends McpToolSpec>({
      name,
      spec,
      handler,
    }: McpTool<Spec>): void => {
      server.registerTool(
        name,
        spec,
        handler as ToolCallback<Spec['inputSchema']>
      );
    };

    registerTool(createAddRemoteFileSourcesTool());
    registerTool(createConnectToServerTool(this));
    registerTool(createGetColumnStatsTool(this));
    registerTool(createGetLogsTool(this));
    registerTool(createGetTableDataTool(this));
    registerTool(createGetTableStatsTool(this));
    registerTool(createListConnectionsTool(this));
    registerTool(createListVariablesTool(this));
    registerTool(createListRemoteFileSourcesTool(this));
    registerTool(createListServersTool(this));
    registerTool(createOpenFilesInEditorTool());
    registerTool(createOpenVariablePanelsTool(this));
    registerTool(createRemoveRemoteFileSourcesTool());
    registerTool(createRunCodeFromUriTool(this));
    registerTool(createRunCodeTool(this));
    registerTool(createShowOutputPanelTool(this));

    return server;
  };

  /**
   * Handle a request on the MCP endpoint. Rejects non-localhost Host / Origin
   * headers (DNS rebinding protection), then routes by protocol era.
   */
  private handleMcpRequest = async (
    request: Request,
    options?: McpHandlerRequestOptions
  ): Promise<Response> => {
    const rejected =
      hostHeaderValidationResponse(request, localhostAllowedHostnames()) ??
      originValidationResponse(request, localhostAllowedOrigins());

    if (rejected != null) {
      return rejected;
    }

    if (await isLegacyRequest(request)) {
      return this.handleLegacyRequest(request);
    }

    return this.modernHandler.fetch(request, options);
  };

  /**
   * Serve a 2025-era request statelessly with a fresh SDK server and transport
   * and a plain `application/json` response.
   */
  private handleLegacyRequest = async (request: Request): Promise<Response> => {
    // Stateless server, so no standalone SSE stream (GET) or sessions (DELETE)
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { allow: 'POST' },
      });
    }

    const server = this.createSdkServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    try {
      await server.connect(transport);
      // With `enableJsonResponse`, the response is only built once the result
      // exists, so the server can be closed as soon as this resolves.
      return await transport.handleRequest(request);
    } finally {
      await server.close();
    }
  };

  /**
   * Start the MCP server on an HTTP endpoint.
   * Each request is served by a fresh SDK server (stateless operation).
   *
   * @param preferredPort Optional port to try first. If not provided or unavailable, will auto-allocate.
   * @returns The actual port the server is listening on
   */
  async start(preferredPort?: number): Promise<number> {
    const portToTry = preferredPort ?? 0;

    const { promise, resolve, reject } = withResolvers<number>();

    const nodeHandler = toNodeHandler(
      { fetch: this.handleMcpRequest },
      { onerror: error => logger.error('MCP request error:', error) }
    );

    this.httpServer = http.createServer((req, res) => {
      if (req.url !== '/mcp') {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('Not found');
        return;
      }

      void nodeHandler(req, res);
    });

    this.httpServer.listen(portToTry, () => {
      // Get the actual port assigned by the OS (important when port is 0)
      const address = this.httpServer?.address();

      // Address should only be null before listening event fired, and string
      // type should only be returned for pipe or Unix domain socket. Neither of
      // these scenarios should be possible, so this check is mostly just for
      // narrowing the type.
      if (address == null || typeof address === 'string') {
        reject(new Error('Failed to start MCP server: invalid server address'));
        return;
      }

      this.port = address.port;
      resolve(this.port);
    });

    this.httpServer.on('error', (error: NodeJS.ErrnoException) => {
      // If preferred port is in use, try auto-allocating
      if (
        error.code === 'EADDRINUSE' &&
        preferredPort != null &&
        preferredPort !== 0
      ) {
        this.httpServer?.close();
        this.httpServer = null;
        // Retry with auto-allocated port
        this.start().then(resolve).catch(reject);
      } else {
        reject(error);
      }
    });

    return promise;
  }

  /**
   * Get the current port the server is listening on.
   * @returns The port number, or null if the server is not running.
   */
  getPort(): number | null {
    return this.port;
  }

  /**
   * Stop server on dispose.
   */
  override async onDisposing(): Promise<void> {
    await this.stop();
  }

  /**
   * Stop the MCP server.
   */
  async stop(): Promise<void> {
    if (this.httpServer == null) {
      return;
    }

    await this.modernHandler.close();

    const { resolve, reject, promise } = withResolvers<void>();

    this.httpServer.close(err => {
      this.httpServer = null;
      this.port = null;

      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });

    return promise;
  }
}
