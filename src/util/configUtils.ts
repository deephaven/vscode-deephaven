import {
  MCP_DOCS_SERVER_NAME,
  MCP_DOCS_SERVER_URL,
  MCP_SERVER_NAME,
} from '../common';

/**
 * Returns a new mcpServers object with the main Deephaven MCP server entry updated
 * based on enabled state, or the same object if no changes are needed.
 * @param mcpServersConfig The current mcpServers object (or undefined)
 * @param mcpUrl The MCP server URL to set for the main MCP server
 * @param mcpEnabled Whether MCP is enabled
 * @returns The same object if no changes needed, or a new object with changes
 */
export function updateWindsurfMcpServerConfig(
  mcpServersConfig: Record<string, { serverUrl?: string }> | undefined,
  mcpUrl: string,
  mcpEnabled: boolean
): Record<string, { serverUrl?: string }> | undefined {
  if (mcpEnabled) {
    // Already has correct URL, no changes needed
    if (mcpServersConfig?.[MCP_SERVER_NAME]?.serverUrl === mcpUrl) {
      return mcpServersConfig;
    }

    // Add or update mcp server config with correct URL
    return {
      ...mcpServersConfig,
      [MCP_SERVER_NAME]: { serverUrl: mcpUrl },
    };
  }

  // MCP disabled - remove entry if it exists
  if (mcpServersConfig != null && MCP_SERVER_NAME in mcpServersConfig) {
    mcpServersConfig = { ...mcpServersConfig };
    delete mcpServersConfig[MCP_SERVER_NAME];
  }

  return mcpServersConfig;
}

/**
 * Returns a new mcpServers object with the Deephaven docs MCP server entry updated
 * based on enabled state, or the same object if no changes are needed.
 * @param mcpServersConfig The current mcpServers object (or undefined)
 * @param docsMcpEnabled Whether the docs MCP server is enabled
 * @returns The same object if no changes needed, or a new object with changes
 */
export function updateWindsurfDocsMcpServerConfig(
  mcpServersConfig: Record<string, { serverUrl?: string }> | undefined,
  docsMcpEnabled: boolean
): Record<string, { serverUrl?: string }> | undefined {
  if (docsMcpEnabled) {
    // Docs server lives outside of the extension, so it's possible a user may
    // have already added it manually, so we check for any matching URL instead
    // of by name.
    const hasDocsUrl = Object.values(mcpServersConfig ?? {}).some(
      entry => entry.serverUrl === MCP_DOCS_SERVER_URL
    );

    // If docs URL already exists somewhere, no changes needed
    if (hasDocsUrl) {
      return mcpServersConfig;
    }

    // Add docs entry
    return {
      ...mcpServersConfig,
      [MCP_DOCS_SERVER_NAME]: {
        serverUrl: MCP_DOCS_SERVER_URL,
      },
    };
  }

  // Docs disabled - remove named entry if it exists
  if (mcpServersConfig != null && MCP_DOCS_SERVER_NAME in mcpServersConfig) {
    mcpServersConfig = { ...mcpServersConfig };
    delete mcpServersConfig[MCP_DOCS_SERVER_NAME];
  }

  return mcpServersConfig;
}
