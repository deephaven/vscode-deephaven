# Deephaven VS Code MCP Server (experimental)

For VS Code and Windsurf, you can manually download and install the latest mcp-dev .vsix:

   [vscode-deephaven-1.1.8-mcp-dev.0.vsix](https://github.com/deephaven/vscode-deephaven/raw/refs/heads/mcp/releases/vscode-deephaven-1.1.8-mcp-dev.0.vsix)

## VS Code Installation
- Download and install the .vsix
- Restart VS Code
- A toast message should say that Deephaven MCP Server has started
- No need to configure anything. Copilot should now have access to the MCP server

## Windsurf
- Download and install the .vsix
- Restart Windsurf
- Should see a prompt "Your Windsurf MCP config doesn't match this workspace's 'Deephaven VS Code MCP Server'. Update to port XXXXX?"
- Say yes

> Note Windsurf only supports a global mcp server configuration (`~/.codeium/windsurf/mcp_config.json`), but the extension assigns a unique MCP port to each workspace. This means whenever you switch workspaces, you will be prompted to sync the port again so that Cascade can talk to the correct MCP server.