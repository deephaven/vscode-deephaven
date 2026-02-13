import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { randomUUID } from 'node:crypto';
import { McpServer as SdkMcpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import * as http from 'http';
import type {
  IAsyncCacheService,
  IPanelService,
  IServerManager,
  McpTool,
  McpToolSpec,
} from '../types';
import { MCP_SERVER_NAME } from '../common';
import {
  createAddRemoteFileSourcesTool,
  createGetColumnStatsTool,
  createDisplayPanelWidgetTool,
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
  createSetEditorConnectionTool,
  createShowOutputPanelTool,
} from './tools';
import { OutputChannelWithHistory, withResolvers } from '../util';
import { DisposableBase, type FilteredWorkspace } from '../services';
import { createConnectToServerTool } from './tools/connectToServer';
import { DEEPHAVEN_PANEL_UI } from './ui/deephaven-panel.js';

/**
 * MCP Server for Deephaven extension.
 * Provides tools for AI assistants (like GitHub Copilot) to interact with Deephaven.
 */
export class McpServer extends DisposableBase {
  private server: SdkMcpServer;
  private httpServer: http.Server | null = null;
  private port: number | null = null;
  private transports = new Map<string, StreamableHTTPServerTransport>();

  constructor(
    readonly coreJsApiCache: IAsyncCacheService<URL, typeof DhcType>,
    readonly outputChannel: OutputChannelWithHistory,
    readonly outputChannelDebug: OutputChannelWithHistory,
    readonly panelService: IPanelService,
    readonly pythonDiagnostics: vscode.DiagnosticCollection,
    readonly pythonWorkspace: FilteredWorkspace,
    readonly serverManager: IServerManager
  ) {
    super();

    // Create an MCP server
    this.server = new SdkMcpServer({
      name: MCP_SERVER_NAME,
      version: '1.0.0',
    });

    this.registerTool(createAddRemoteFileSourcesTool());
    this.registerTool(createConnectToServerTool(this));
    this.registerTool(createGetColumnStatsTool(this));
    this.registerTool(createDisplayPanelWidgetTool(this));
    this.registerTool(createGetLogsTool(this));
    this.registerTool(createGetTableDataTool(this));
    this.registerTool(createGetTableStatsTool(this));
    this.registerTool(createListConnectionsTool(this));
    this.registerTool(createListVariablesTool(this));
    this.registerTool(createListRemoteFileSourcesTool(this));
    this.registerTool(createListServersTool(this));
    this.registerTool(createOpenFilesInEditorTool());
    this.registerTool(createOpenVariablePanelsTool(this));
    this.registerTool(createRemoveRemoteFileSourcesTool());
    this.registerTool(createRunCodeFromUriTool(this));
    this.registerTool(createRunCodeTool(this));
    this.registerTool(createSetEditorConnectionTool(this));
    this.registerTool(createShowOutputPanelTool(this));

    /**
     * Register UI resource for Deephaven panel widget.
     * This enables MCP hosts (like GitHub Copilot) to render interactive Deephaven panels.
     *
     * Resource URIs include variable title as path segment for uniqueness:
     * ui://deephaven/panel/{variableTitle}
     *
     * The panelUrl is extracted from structuredContent.details.panelUrl in the tool result
     * notification.
     *
     * CSP configuration: Uses frameDomains to allow loading panels from all configured
     * Deephaven servers. Per MCP Apps spec, frameDomains maps to CSP frame-src directive.
     */
    this.server.registerResource(
      'deephaven-panel-ui',
      'ui://deephaven/panel',
      {
        description: 'Interactive Deephaven panel widget display',
        mimeType: 'text/html;profile=mcp-app',
      },
      async uri => {
        this.outputChannelDebug.appendLine(
          `[MCP] Resource request for URI: ${uri.href}`
        );

        // Get origins from all configured servers for CSP
        const serverOrigins = this.serverManager
          .getServers()
          .map(server => server.url.origin);

        this.outputChannelDebug.appendLine(
          `[MCP] Allowing origins in CSP: ${serverOrigins.join(', ')}`
        );

        // Allow loading Deephaven panels from all configured servers
        // Using frameDomains (not frameSrc) per MCP Apps spec
        const csp = {
          frameDomains: serverOrigins,
        };

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/html;profile=mcp-app',
              text: DEEPHAVEN_PANEL_UI(),
              _meta: {
                ui: {
                  csp,
                  prefersBorder: false,
                },
              },
            },
          ],
        };
      }
    );
  }

  private registerTool<Spec extends McpToolSpec>({
    name,
    spec,
    handler,
  }: McpTool<Spec>): void {
    this.server.registerTool(name, spec, handler);
  }

  /**
   * Start the MCP server on an HTTP endpoint.
   * Creates a new transport for each request (stateless operation).
   *
   * @param preferredPort Optional port to try first. If not provided or unavailable, will auto-allocate.
   * @returns The actual port the server is listening on
   */
  async start(preferredPort?: number): Promise<number> {
    const portToTry = preferredPort ?? 0;

    const { promise, resolve, reject } = withResolvers<number>();

    this.httpServer = http.createServer(async (req, res) => {
      if (req.url !== '/mcp') {
        res.writeHead(404, { contentType: 'text/plain' });
        res.end('Not found');
      }

      // Only accept POST requests since we don't currenlty support SSE. TBD
      // whether we need SSE in the future.
      if (req.method !== 'POST') {
        res.writeHead(405, {
          contentType: 'text/plain',
          allow: 'POST',
        });
        res.end('Method Not Allowed');
        return;
      }

      // Collect the request body
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const requestBody = JSON.parse(body);
          const sessionId = req.headers['mcp-session-id'] as string | undefined;

          let transport: StreamableHTTPServerTransport;

          if (sessionId && this.transports.has(sessionId)) {
            // Reuse existing transport for this session
            transport = this.transports.get(sessionId)!;
            this.outputChannelDebug.appendLine(
              `[MCP] Reusing transport for session: ${sessionId}`
            );
          } else if (!sessionId && isInitializeRequest(requestBody)) {
            // New initialization request - create new transport
            transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: (): string => randomUUID(),
              onsessioninitialized: (sessionId): void => {
                this.outputChannelDebug.appendLine(
                  `[MCP] Session initialized: ${sessionId}`
                );
                this.transports.set(sessionId, transport);
              },
              onsessionclosed: (sessionId): void => {
                this.outputChannelDebug.appendLine(
                  `[MCP] Session closed: ${sessionId}`
                );
                this.transports.delete(sessionId);
              },
              enableJsonResponse: true,
            });

            // Clean up transport when closed
            transport.onclose = (): void => {
              const sid = transport.sessionId;
              if (sid && this.transports.has(sid)) {
                this.outputChannelDebug.appendLine(
                  `[MCP] Transport closed for session ${sid}`
                );
                this.transports.delete(sid);
              }
            };

            // Connect the transport to the MCP server (only once for new sessions)
            await this.server.connect(transport);
          } else {
            // Invalid request - no session ID or not an initialization request
            res.writeHead(400, { contentType: 'application/json' });
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                error: {
                  code: -32000,
                  message: 'Bad Request: No valid session ID provided',
                },
                id: null,
              })
            );
            return;
          }

          // Handle the request with the transport
          await transport.handleRequest(req, res, requestBody);
        } catch (error) {
          res.writeHead(500, { contentType: 'application/json' });
          res.end(
            JSON.stringify({
              error: `Failed to process request: ${error instanceof Error ? error.message : String(error)}`,
            })
          );
        }
      });
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

    // Clean up all active sessions
    if (this.transports.size > 0) {
      this.outputChannelDebug.appendLine(
        `[MCP] Cleaning up ${this.transports.size} active session(s)`
      );
      for (const [sessionId, transport] of this.transports.entries()) {
        this.outputChannelDebug.appendLine(
          `[MCP] Closing session: ${sessionId}`
        );
        transport.close();
      }
      this.transports.clear();
    }

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
