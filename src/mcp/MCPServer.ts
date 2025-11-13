import * as vscode from 'vscode';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import {
  CONNECT_TO_SERVER_CMD,
  RUN_CODE_COMMAND,
  type RunCodeCmdArgs,
} from '../common/commands';
import type { IPanelService, IServerManager } from '../types';
import * as http from 'http';

/**
 * MCP Server for Deephaven extension.
 * Provides tools for AI assistants (like GitHub Copilot) to interact with Deephaven.
 */
export class MCPServer {
  private server: McpServer;
  private httpServer: http.Server | null = null;
  private port: number;
  private panelService: IPanelService | null = null;
  private serverManager: IServerManager | null = null;

  constructor(
    port: number = 3000,
    panelService?: IPanelService,
    serverManager?: IServerManager
  ) {
    this.port = port;
    this.panelService = panelService ?? null;
    this.serverManager = serverManager ?? null;

    // Create an MCP server
    this.server = new McpServer({
      name: 'deephaven-vscode',
      version: '1.0.0',
    });

    this.registerTools();
  }

  private registerTools(): void {
    // Register the runCode tool
    this.server.registerTool(
      'runCode',
      {
        title: 'Run Deephaven Code',
        description:
          'Execute code in a Deephaven session. Runs the code from a file or the current selection.',
        inputSchema: {
          uri: z
            .string()
            .optional()
            .describe(
              'The file URI to run. If not provided, runs the active editor.'
            ),
          constrainTo: z
            .enum(['selection'])
            .optional()
            .describe('Constrain execution to current selection'),
          languageId: z
            .string()
            .optional()
            .describe('The language ID (python, groovy) to use for execution'),
        },
        outputSchema: {
          success: z.boolean(),
          message: z.string(),
        },
      },
      async ({
        uri,
        constrainTo,
        languageId,
      }: {
        uri?: string;
        constrainTo?: 'selection';
        languageId?: string;
      }) => {
        try {
          // Parse URI if provided
          const parsedUri = uri ? vscode.Uri.parse(uri) : undefined;

          // Build command arguments
          const cmdArgs: RunCodeCmdArgs = [
            parsedUri,
            undefined, // groupId
            constrainTo,
            languageId,
          ];

          // Execute the command
          await vscode.commands.executeCommand(RUN_CODE_COMMAND, ...cmdArgs);

          const output = {
            success: true,
            message: 'Code executed successfully',
          };

          return {
            content: [{ type: 'text' as const, text: JSON.stringify(output) }],
            structuredContent: output,
          };
        } catch (error) {
          const output = {
            success: false,
            message: `Failed to execute code: ${error instanceof Error ? error.message : String(error)}`,
          };

          return {
            content: [{ type: 'text' as const, text: JSON.stringify(output) }],
            structuredContent: output,
          };
        }
      }
    );

    // Register the listPanelVariables tool
    this.server.registerTool(
      'listPanelVariables',
      {
        title: 'List Panel Variables',
        description:
          'List all panel variables for a given Deephaven connection URL.',
        inputSchema: {
          url: z
            .string()
            .describe('The connection URL (e.g., "http://localhost:10000")'),
        },
        outputSchema: {
          success: z.boolean(),
          variables: z
            .array(
              z.object({
                id: z.string(),
                title: z.string(),
                type: z.string(),
              })
            )
            .optional(),
          message: z.string().optional(),
        },
      },
      async ({ url }: { url: string }) => {
        try {
          if (!this.panelService) {
            const output = {
              success: false,
              message: 'Panel service not available',
            };
            return {
              content: [
                { type: 'text' as const, text: JSON.stringify(output) },
              ],
              structuredContent: output,
            };
          }

          if (!this.serverManager) {
            const output = {
              success: false,
              message: 'Server manager not available',
            };
            return {
              content: [
                { type: 'text' as const, text: JSON.stringify(output) },
              ],
              structuredContent: output,
            };
          }

          // Parse URL
          const parsedUrl = new URL(url);

          // Check if there's an active connection to this URL
          const connections = this.serverManager.getConnections(parsedUrl);
          const hasConnection = connections.length > 0;

          if (!hasConnection) {
            const server = this.serverManager.getServer(parsedUrl);

            if (!server) {
              const output = {
                success: false,
                message: `Server not found: ${url}. Use listServers to see available servers.`,
              };
              return {
                content: [
                  { type: 'text' as const, text: JSON.stringify(output) },
                ],
                structuredContent: output,
              };
            }

            // Only auto-connect for DHC servers
            if (server.type === 'DHC') {
              // Connect to the DHC server
              const serverState = {
                type: server.type,
                url: server.url,
              };

              await vscode.commands.executeCommand(
                CONNECT_TO_SERVER_CMD,
                serverState
              );
            } else {
              // For DHE servers, require manual connection
              const output = {
                success: false,
                message: `No active connection to ${url}. Use connectToServer first.`,
              };
              return {
                content: [
                  { type: 'text' as const, text: JSON.stringify(output) },
                ],
                structuredContent: output,
              };
            }
          }

          // Get panel variables
          const variables = [...this.panelService.getVariables(parsedUrl)].map(
            ({ id, title, type }) => ({ id, title, type })
          );

          const output = {
            success: true,
            variables,
            message: `Found ${variables.length} panel variable(s)`,
          };

          return {
            content: [{ type: 'text' as const, text: JSON.stringify(output) }],
            structuredContent: output,
          };
        } catch (error) {
          const output = {
            success: false,
            message: `Failed to list panel variables: ${error instanceof Error ? error.message : String(error)}`,
          };

          return {
            content: [{ type: 'text' as const, text: JSON.stringify(output) }],
            structuredContent: output,
          };
        }
      }
    );

    // Register the listConnections tool
    this.server.registerTool(
      'listConnections',
      {
        title: 'List Connections',
        description:
          'List all active Deephaven connections, optionally filtered by server URL.',
        inputSchema: {
          serverUrl: z
            .string()
            .optional()
            .describe(
              'Optional server URL to filter connections (e.g., "http://localhost:10000")'
            ),
        },
        outputSchema: {
          success: z.boolean(),
          connections: z
            .array(
              z.object({
                serverUrl: z.string(),
                isConnected: z.boolean(),
                isRunningCode: z.boolean().optional(),
                tagId: z.string().optional(),
              })
            )
            .optional(),
          message: z.string().optional(),
        },
      },
      async ({ serverUrl }: { serverUrl?: string }) => {
        try {
          if (!this.serverManager) {
            const output = {
              success: false,
              message: 'Server manager not available',
            };
            return {
              content: [
                { type: 'text' as const, text: JSON.stringify(output) },
              ],
              structuredContent: output,
            };
          }

          // Get connections, optionally filtered by serverUrl
          const parsedUrl = serverUrl ? new URL(serverUrl) : undefined;
          const rawConnections = this.serverManager.getConnections(parsedUrl);

          const connections = rawConnections.map(connection => ({
            serverUrl: connection.serverUrl.toString(),
            isConnected: connection.isConnected,
            isRunningCode: connection.isRunningCode,
            tagId: connection.tagId,
          }));

          const output = {
            success: true,
            connections,
            message: `Found ${connections.length} connection(s)`,
          };

          return {
            content: [{ type: 'text' as const, text: JSON.stringify(output) }],
            structuredContent: output,
          };
        } catch (error) {
          const output = {
            success: false,
            message: `Failed to list connections: ${error instanceof Error ? error.message : String(error)}`,
          };

          return {
            content: [{ type: 'text' as const, text: JSON.stringify(output) }],
            structuredContent: output,
          };
        }
      }
    );

    // Register the listServers tool
    this.server.registerTool(
      'listServers',
      {
        title: 'List Servers',
        description:
          'List all Deephaven servers with optional filtering by running status, connection status, or type.',
        inputSchema: {
          isRunning: z
            .boolean()
            .optional()
            .describe(
              'Filter by running status (true = running, false = stopped)'
            ),
          hasConnections: z
            .boolean()
            .optional()
            .describe(
              'Filter by connection status (true = has connections, false = no connections)'
            ),
          type: z
            .enum(['DHC', 'DHE'])
            .optional()
            .describe(
              'Filter by server type (DHC = Community, DHE = Enterprise)'
            ),
        },
        outputSchema: {
          success: z.boolean(),
          servers: z
            .array(
              z.object({
                type: z.string(),
                url: z.string(),
                label: z.string().optional(),
                isConnected: z.boolean(),
                isRunning: z.boolean(),
                connectionCount: z.number(),
                isManaged: z.boolean().optional(),
              })
            )
            .optional(),
          message: z.string().optional(),
        },
      },
      async ({
        isRunning,
        hasConnections,
        type,
      }: {
        isRunning?: boolean;
        hasConnections?: boolean;
        type?: 'DHC' | 'DHE';
      }) => {
        try {
          if (!this.serverManager) {
            const output = {
              success: false,
              message: 'Server manager not available',
            };
            return {
              content: [
                { type: 'text' as const, text: JSON.stringify(output) },
              ],
              structuredContent: output,
            };
          }

          // Get servers with optional filters
          const servers = this.serverManager
            .getServers({ isRunning, hasConnections, type })
            .map(server => ({
              type: server.type,
              url: server.url.toString(),
              label: server.label,
              isConnected: server.isConnected,
              isRunning: server.isRunning,
              connectionCount: server.connectionCount,
              isManaged: server.isManaged,
            }));

          const output = {
            success: true,
            servers,
            message: `Found ${servers.length} server(s)`,
          };

          return {
            content: [{ type: 'text' as const, text: JSON.stringify(output) }],
            structuredContent: output,
          };
        } catch (error) {
          const output = {
            success: false,
            message: `Failed to list servers: ${error instanceof Error ? error.message : String(error)}`,
          };

          return {
            content: [{ type: 'text' as const, text: JSON.stringify(output) }],
            structuredContent: output,
          };
        }
      }
    );

    // Register the connectToServer tool
    this.server.registerTool(
      'connectToServer',
      {
        title: 'Connect to Server',
        description:
          'Create a connection to a Deephaven server. The server must already be configured in the extension. For DHE (Enterprise) servers, this will create a new worker.',
        inputSchema: {
          url: z
            .string()
            .describe('Server URL (e.g., "http://localhost:10000")'),
        },
        outputSchema: {
          success: z.boolean(),
          message: z.string(),
        },
      },
      async ({ url }: { url: string }) => {
        try {
          if (!this.serverManager) {
            const output = {
              success: false,
              message: 'Server manager not available',
            };
            return {
              content: [
                { type: 'text' as const, text: JSON.stringify(output) },
              ],
              structuredContent: output,
            };
          }

          // Parse and validate URL
          const serverUrl = new URL(url);

          // Find the server in the configured servers list
          const server = this.serverManager.getServer(serverUrl);

          if (!server) {
            const output = {
              success: false,
              message: `Server not found: ${url}. Use listServers to see available servers.`,
            };
            return {
              content: [
                { type: 'text' as const, text: JSON.stringify(output) },
              ],
              structuredContent: output,
            };
          }

          // Build server state object with type from the found server
          const serverState = {
            type: server.type,
            url: serverUrl,
          };

          // Execute the connect command
          await vscode.commands.executeCommand(
            CONNECT_TO_SERVER_CMD,
            serverState
          );

          const output = {
            success: true,
            message: `Connecting to ${server.type} server at ${url}`,
          };

          return {
            content: [{ type: 'text' as const, text: JSON.stringify(output) }],
            structuredContent: output,
          };
        } catch (error) {
          const output = {
            success: false,
            message: `Failed to connect to server: ${error instanceof Error ? error.message : String(error)}`,
          };

          return {
            content: [{ type: 'text' as const, text: JSON.stringify(output) }],
            structuredContent: output,
          };
        }
      }
    );
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
