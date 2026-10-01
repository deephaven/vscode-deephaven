# Headless VS Code for agent testing

Runs a real VS Code desktop with this repo's extension (dev build, via
`--extensionDevelopmentPath`) on an Xvfb display inside the devcontainer, so an
agent can drive the UI, take screenshots, and call the extension's MCP tools.

## One-time setup

```bash
.devcontainer/scripts/ensure-headless-env.sh --install   # apt: Xvfb + Electron libs (also run by .devcontainer/post-create.sh)
```

The UI driver (`chrome-devtools-mcp`, attached to CDP port 9222) is registered
for Claude Code in local scope by `.devcontainer/post-create.sh`. To register it
by hand:

```bash
claude mcp add --scope local chrome-devtools -- \
  npx -y chrome-devtools-mcp@1.10.1 --browserUrl http://127.0.0.1:9222 \
  --no-usage-statistics --no-performance-crux
```

Do **not** use Playwright MCP: once a Deephaven panel is open it loses the
workbench (its main frame resolves to the panel iframe).

## Deephaven server

Docker isn't available in the container. Start a server on the **host**:

```bash
docker compose --project-directory e2e-testing up -d dhc-server
```

From the container it's `http://host.docker.internal:10000/` (`localhost`
does not reach the host).

## Commands

```bash
DH_SERVER_URL=http://host.docker.internal:10000/ .devcontainer/scripts/vscode-dev.sh start [WORKSPACE]
.devcontainer/scripts/vscode-dev.sh restart [WORKSPACE]   # after code changes (recompiles)
.devcontainer/scripts/vscode-dev.sh status                # JSON: running, pid, display, cdpEndpoint, mcpUrl, log
.devcontainer/scripts/vscode-dev.sh screenshot [OUT.png]  # prints the PNG path; open it to look
.devcontainer/scripts/vscode-dev.sh stop
```

- `start` runs `npm i` if dependencies are missing or stale, compiles the extension,
  downloads VS Code on first run, installs `extensionDependencies`, then waits
  for CDP and the extension MCP server.
  If already running it just prints status.
- Default workspace: `e2e-testing/test-ws`.
- State (VS Code install, profile, logs, screenshots): `~/.dh-vscode-dev`
  (`VSCODE_DEV_HOME`). CDP port: `9222` (`VSCODE_CDP_PORT`).
- Settings are seeded on first run in
  `~/.dh-vscode-dev/user-data/User/settings.json`; `DH_SERVER_URL` is merged into
  `deephaven.coreServers` on every start. Delete the file to reseed.

## Testing features

**Extension MCP (fastest, no UI):** POST JSON-RPC to `mcpUrl` from `status`
(`Accept: application/json, text/event-stream`). E.g. `connectToServer`
`{"url":"http://host.docker.internal:10000/"}`, then `runCodeFromUri`
`{"uri":"file:///…/e2e-testing/test-ws/simple_ticking3.py","connectionUrl":"http://host.docker.internal:10000/"}`
opens panels `t1`–`t3`. `getTableData` reads table contents.

**UI via chrome-devtools-mcp:**

- Every tool call needs `pageId: 1` (the workbench); without it the call fails
  validation.
- `take_snapshot` covers the whole workbench including Deephaven panel iframes
  (`RootWebArea "t3 - Deephaven"`). Grid cells are drawn on a `<canvas>` and are
  **not** in the snapshot — use `getTableData` or a screenshot.
- Keyboard focus: if a panel iframe has focus, keys go to the panel. `click` a
  workbench element (editor tab, tree item) before `press_key Control+Shift+P`.
- Double-click a variable in the Interactive Consoles tree to open its panel.

## Known noise

- `vscode.log` is full of `dbus … Failed to connect to the bus` — harmless.
- Python Environments toast "Error refreshing packages" — the container's
  `python3` has no pip; unrelated to this extension.
