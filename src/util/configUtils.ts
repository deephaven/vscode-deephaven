import {
  MCP_DOCS_SERVER_NAME,
  MCP_DOCS_SERVER_URL,
  MCP_SERVER_NAME,
} from '../common';

/**
 * Returns a new mcpServers object with the main Deephaven MCP server entry added
 * or updated, or the same object if no changes are needed.
 * @param mcpServersConfig The current mcpServers object (or undefined)
 * @param mcpUrl The MCP server URL to set for the main MCP server
 * @returns The same object if no changes needed, or a new object with changes
 */
export function updateWindsurfMcpServerConfig(
  mcpServersConfig: Record<string, { serverUrl?: string }> | undefined,
  mcpUrl: string
): Record<string, { serverUrl?: string }> | undefined {
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

/**
 * Returns a new mcpServers object with the Deephaven docs MCP server entry added
 * or updated, or the same object if no changes are needed.
 * @param mcpServersConfig The current mcpServers object (or undefined)
 * @returns The same object if no changes needed, or a new object with changes
 */
export function updateWindsurfDocsMcpServerConfig(
  mcpServersConfig: Record<string, { serverUrl?: string }> | undefined
): Record<string, { serverUrl?: string }> | undefined {
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

/**
 * Returns a new config object with the specified keys deleted,
 * or the same object if no changes are needed.
 * @param config The current config object (or undefined)
 * @param keys Array of keys to delete from the config
 * @returns The same object if no changes needed, or a new object with deletions applied
 */
export function deleteConfigKeys<T extends Record<string, unknown>>(
  config: T | undefined,
  keys: string[]
): T | undefined {
  // Nothing to delete
  if (config == null || keys.length === 0) {
    return config;
  }

  // Check if any keys exist that need to be deleted
  const keysToDelete = keys.filter(key => key in config);

  if (keysToDelete.length === 0) {
    return config;
  }

  // Create a new object and delete entries
  const newConfig = { ...config };

  for (const key of keysToDelete) {
    delete newConfig[key];
  }

  return newConfig;
}
