# Configuring GitHub Copilot to Use the MCP Server

## Automatic Configuration (Recommended)

The extension automatically configures the MCP server when it starts:

1. **Start the extension**: Press `F5` to launch in debug mode
2. **Wait for notification**: You'll see "Deephaven MCP Server started on port XXXXX. Reload window to activate in Copilot."
3. **Reload VS Code**: Press `Cmd+Shift+P` → "Developer: Reload Window"
4. **The MCP server is now available to Copilot!**

The extension will automatically:
- Find an available port (so multiple workspaces can run simultaneously)
- Update your workspace settings with the correct URL
- Register the server with GitHub Copilot

## How It Works

- Each workspace gets its own MCP server on a unique port
- Port is assigned dynamically by the OS (no conflicts!)
- Configuration is written to `.vscode/settings.json` automatically
- After reload, Copilot can use the `runCode` tool

## Verify It's Working

1. **Check workspace settings**: Look at `.vscode/settings.json` - you should see:
   ```json
   {
     "chat.mcp.servers": {
       "deephaven": {
         "url": "http://localhost:XXXXX/mcp"
       }
     }
   }
   ```
2. **Open Copilot Chat**: Press `Cmd+Shift+I` or click the chat icon
3. **Test it**: Ask Copilot something like:
   ```
   Execute this Python code: print("Hello from Deephaven")
   ```

## Manual Configuration (if needed)

If automatic configuration doesn't work, you can manually set the port in `.vscode/settings.json`:

```json
{
  "chat.mcp.servers": {
    "deephaven": {
      "url": "http://localhost:PORT_NUMBER/mcp"
    }
  }
}
```

Check the "Deephaven" output channel to find the actual port number.

## Notes

- The MCP server must be running (extension must be active)
- Each workspace gets its own unique port
- Multiple VS Code instances can run simultaneously without conflicts
- The port is dynamically assigned by the OS
- You need to reload the window after the server starts for Copilot to discover it
- GitHub Copilot will automatically discover and use the `runCode` tool
- You can see MCP server logs in the "Deephaven" output channel
