import * as vscode from 'vscode';
import { McpServer as SdkMcpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as http from 'http';
import type {
  IPanelService,
  IServerManager,
  McpTool,
  McpToolSpec,
} from '../types';
import { MCP_SERVER_NAME } from '../common';
import {
  createAddRemoteFileSourcesTool,
  createGetLogsTool,
  createListConnectionsTool,
  createListPanelVariablesTool,
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

/**
 * MCP Server for Deephaven extension.
 * Provides tools for AI assistants (like GitHub Copilot) to interact with Deephaven.
 */
export class McpServer extends DisposableBase {
  private server: SdkMcpServer;
  private httpServer: http.Server | null = null;
  private port: number | null = null;

  readonly pythonDiagnostics: vscode.DiagnosticCollection;
  readonly pythonWorkspace: FilteredWorkspace;
  readonly serverManager: IServerManager;
  readonly outputChannel: OutputChannelWithHistory;
  readonly outputChannelDebug: OutputChannelWithHistory;
  readonly panelService: IPanelService;

  constructor(
    pythonDiagnostics: vscode.DiagnosticCollection,
    pythonWorkspace: FilteredWorkspace,
    serverManager: IServerManager,
    outputChannel: OutputChannelWithHistory,
    outputChannelDebug: OutputChannelWithHistory,
    panelService: IPanelService
  ) {
    super();

    this.pythonDiagnostics = pythonDiagnostics;
    this.pythonWorkspace = pythonWorkspace;
    this.serverManager = serverManager;
    this.outputChannel = outputChannel;
    this.outputChannelDebug = outputChannelDebug;
    this.panelService = panelService;

    // Create an MCP server
    this.server = new SdkMcpServer({
      name: MCP_SERVER_NAME,
      version: '1.0.0',
    });

    this.registerTool(createAddRemoteFileSourcesTool());
    this.registerTool(createConnectToServerTool(this));
    this.registerTool(createGetLogsTool(this));
    this.registerTool(createListConnectionsTool(this));
    this.registerTool(createListRemoteFileSourcesTool(this));
    this.registerTool(createListServersTool(this));
    this.registerTool(createOpenFilesInEditorTool());
    this.registerTool(createRemoveRemoteFileSourcesTool());
    this.registerTool(createListPanelVariablesTool(this));
    this.registerTool(createListServersTool(this));
    this.registerTool(createOpenVariablePanelsTool(this));
    this.registerTool(createRunCodeFromUriTool(this));
    this.registerTool(createRunCodeTool(this));
    this.registerTool(createSetEditorConnectionTool(this));
    this.registerTool(createShowOutputPanelTool(this));
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

          // Create a new transport for each request
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
          });

          res.on('close', () => {
            transport.close();
          });

          await this.server.connect(transport);
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
