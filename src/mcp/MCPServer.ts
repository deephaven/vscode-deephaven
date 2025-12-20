import * as vscode from 'vscode';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as http from 'http';
import type {
  IPanelService,
  IServerManager,
  McpTool,
  McpToolSpec,
} from '../types';
import type { PipServerController } from '../controllers';
import type { OutputChannelWithHistory } from '../util';
import { MCP_SERVER_NAME } from '../common';
import { createRunCodeTool } from './tools/runCode';
import { createListPanelVariablesTool } from './tools/listPanelVariables';
import { createListConnectionsTool } from './tools/listConnections';
import { createListServersTool } from './tools/listServers';
import { createConnectToServerTool } from './tools/connectToServer';
import { createSetEditorConnectionTool } from './tools/setEditorConnection';
import { createOpenVariablePanelsTool } from './tools/openVariablePanels';
import { createStartPipServerTool } from './tools/startPipServer';
import { createCheckPythonEnvTool } from './tools/checkPythonEnvironment';
import { createAddRemoteFileSourcesTool } from './tools/addRemoteFileSources';
import { createOpenFilesInEditorTool } from './tools/openFilesInEditor';
import { createShowOutputPanelTool } from './tools/showOutputPanel';
import { createGetLogsTool } from './tools/getLogs';
import type { FilteredWorkspace } from '../services';

/**
 * MCP Server for Deephaven extension.
 * Provides tools for AI assistants (like GitHub Copilot) to interact with Deephaven.
 */
export class MCPServer {
  private server: McpServer;
  private httpServer: http.Server | null = null;
  private port: number | null = null;
  private readonly outputChannel: vscode.OutputChannel;
  private readonly outputChannelDebug: OutputChannelWithHistory;
  private readonly panelService: IPanelService;
  private readonly pipServerController: PipServerController;
  private readonly pythonDiagnostics: vscode.DiagnosticCollection;
  private readonly pythonWorkspace: FilteredWorkspace;
  private readonly serverManager: IServerManager;

  constructor(
    outputChannel: vscode.OutputChannel,
    outputChannelDebug: OutputChannelWithHistory,
    panelService: IPanelService,
    pipServerController: PipServerController,
    pythonDiagnostics: vscode.DiagnosticCollection,
    pythonWorkspace: FilteredWorkspace,
    serverManager: IServerManager
  ) {
    this.outputChannel = outputChannel;
    this.outputChannelDebug = outputChannelDebug;
    this.panelService = panelService;
    this.pipServerController = pipServerController;
    this.pythonDiagnostics = pythonDiagnostics;
    this.pythonWorkspace = pythonWorkspace;
    this.serverManager = serverManager;

    // Create an MCP server
    this.server = new McpServer({
      name: MCP_SERVER_NAME,
      version: '1.0.0',
    });

    this.registerTools();
  }

  private registerTool<Spec extends McpToolSpec>({
    name,
    spec,
    handler,
  }: McpTool<Spec>): void {
    this.server.registerTool(name, spec, handler);
  }

  private registerTools(): void {
    this.registerTool(
      createRunCodeTool(
        this.pythonDiagnostics,
        this.pythonWorkspace,
        this.serverManager
      )
    );
    this.registerTool(
      createListPanelVariablesTool(this.panelService, this.serverManager)
    );
    this.registerTool(createListConnectionsTool(this.serverManager));
    this.registerTool(createListServersTool(this.serverManager));
    this.registerTool(createConnectToServerTool(this.serverManager));
    this.registerTool(createSetEditorConnectionTool(this.serverManager));
    this.registerTool(createOpenVariablePanelsTool(this.serverManager));
    this.registerTool(createStartPipServerTool(this.pipServerController));
    this.registerTool(createCheckPythonEnvTool(this.pipServerController));
    this.registerTool(createAddRemoteFileSourcesTool());
    this.registerTool(createOpenFilesInEditorTool());
    this.registerTool(
      createShowOutputPanelTool(this.outputChannel, this.outputChannelDebug)
    );
    this.registerTool(createGetLogsTool(this.outputChannelDebug));
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

    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer(async (req, res) => {
        if (req.url === '/mcp' && req.method === 'POST') {
          // Collect the request body
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });

          req.on('end', async () => {
            try {
              const requestBody = JSON.parse(body);

              // Create a new transport for each request to prevent request ID collisions
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
        } else {
          res.writeHead(404, { contentType: 'text/plain' });
          res.end('Not found');
        }
      });

      this.httpServer.listen(portToTry, () => {
        // Get the actual port assigned by the OS (important when port is 0)
        const address = this.httpServer!.address();
        if (address && typeof address !== 'string') {
          this.port = address.port;
        }
        resolve(this.port!);
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
          this.start(0).then(resolve).catch(reject);
        } else {
          vscode.window.showErrorMessage(
            `Failed to start MCP server: ${error.message}`
          );
          reject(error);
        }
      });
    });
  }

  /**
   * Get the current port the server is listening on.
   * @returns The port number, or null if the server is not running.
   */
  getPort(): number | null {
    return this.port;
  }

  /**
   * Stop the MCP server.
   */
  async stop(): Promise<void> {
    if (this.httpServer) {
      return new Promise((resolve, reject) => {
        this.httpServer!.close(err => {
          if (err) {
            reject(err);
          } else {
            this.httpServer = null;
            this.port = null;
            resolve();
          }
        });
      });
    }
  }
}
