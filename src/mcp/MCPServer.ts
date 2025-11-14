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
import { createRunCodeTool } from './tools/runCode';
import { createListPanelVariablesTool } from './tools/listPanelVariables';
import { createListConnectionsTool } from './tools/listConnections';
import { createListServersTool } from './tools/listServers';
import { createConnectToServerTool } from './tools/connectToServer';
import { createSetEditorConnectionTool } from './tools/setEditorConnection';
import { createOpenVariablePanelsTool } from './tools/openVariablePanels';
import { createStartPipServerTool } from './tools/startPipServer';
import type { PipServerController } from '../controllers';

/**
 * MCP Server for Deephaven extension.
 * Provides tools for AI assistants (like GitHub Copilot) to interact with Deephaven.
 */
export class MCPServer {
  private server: McpServer;
  private httpServer: http.Server | null = null;
  private port: number;
  private readonly panelService: IPanelService;
  private readonly pipServerController: PipServerController;
  private readonly serverManager: IServerManager;

  constructor(
    port: number,
    panelService: IPanelService,
    pipServerController: PipServerController,
    serverManager: IServerManager
  ) {
    this.port = port;
    this.panelService = panelService;
    this.pipServerController = pipServerController;
    this.serverManager = serverManager;

    // Create an MCP server
    this.server = new McpServer({
      name: 'deephaven-vscode',
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
    this.registerTool(createRunCodeTool(this.serverManager));
    this.registerTool(
      createListPanelVariablesTool(this.panelService, this.serverManager)
    );
    this.registerTool(createListConnectionsTool(this.serverManager));
    this.registerTool(createListServersTool(this.serverManager));
    this.registerTool(createConnectToServerTool(this.serverManager));
    this.registerTool(createSetEditorConnectionTool(this.serverManager));
    this.registerTool(createOpenVariablePanelsTool(this.serverManager));
    this.registerTool(createStartPipServerTool(this.pipServerController));
  }

  /**
   * Start the MCP server on an HTTP endpoint.
   * @returns The actual port the server is listening on
   */
  async start(): Promise<number> {
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

      this.httpServer.listen(this.port, () => {
        // Get the actual port assigned by the OS (important when port is 0)
        const address = this.httpServer!.address();
        if (address && typeof address !== 'string') {
          this.port = address.port;
        }
        resolve(this.port);
      });

      this.httpServer.on('error', error => {
        vscode.window.showErrorMessage(
          `Failed to start MCP server: ${error.message}`
        );
        reject(error);
      });
    });
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
            resolve();
          }
        });
      });
    }
  }
}
