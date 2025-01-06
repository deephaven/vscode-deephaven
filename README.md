# Deephaven VS Code Extension

## Installation

The Deephaven VS Code extension can be installed from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=deephaven.vscode-deephaven) or from the extension browser inside of `VS Code`. The extension is currently `pre-release`, so you'll need to install it as such.

![Install Deephaven VS Code Extension](./docs/assets/install-pre-release.png)

Once installed, there will be a new icon in the `activity bar` (the sidebar containing navigation icons). Clicking the Deephaven icon will show a new panel containing details of configured Deephaven servers. By default, the extension is configured to connect to a single Community server hosted at `http:localhost:10000`.

![VS Code Activity Bar](./docs/assets/dh-activity-bar.gif)

The "SERVERS" tree will show the status of any configured servers. To run a script against a running server, simply click the `Run Deephaven File` action at the top of a file supported by the server (`python` or `groovy`).

![Connect to Community Server](./docs/assets/dhc-connect-to-server.gif)

A new connection will show up in the "CONNECTIONS" tree, and the "PANELS" should show any variables exposed on the connection. To disconnect, hover over the connection item and click the trash icon.

## Configuration

A single Community server `http://localhost:10000/` is configured by default and doesn't require any additional config. Additional connections can be configured in `VS Code` settings.

> Note: There are some `VS Code` bugs that cause some flakiness with the `run` button. `VS Code` `v90` introduced an optional `workbench.editor.alwaysShowEditorActions` setting. Setting this to `true` improves the experience here. Namely the run button will not disappear when running commands or selecting its dropdown. See https://github.com/deephaven/vscode-deephaven/issues/1 for more details.

### Community Servers

Community servers can be configured via the `"deephaven.coreServers"` setting in `VS Code` user or workspace settings.

![Community Server Settings](./docs/assets/add-community-server.gif)


### Enterprise Servers
Enterprise servers can be configured via the `"deephaven.enterpriseServers"` setting in `VS Code` user or workspace settings.

```jsonc
"deephaven.enterpriseServers": [
  // Simplest config is to provide the server URL
  "https://my-server-a.acme.org:8123/",
  // Advanced config
  {
    "url": "https://my-server-b.acme.org:8123/",
    "label": "Server B",
    // Configure PQ workers created by the extension
    "experimentalWorkerConfig": {
      "heapSize": 0.5
    }
  }
]
```

![Enterprise Server Settings](./docs/assets/dhe-settings.gif)

## Workspace Setup
It is recommended to configure a virtual python environment within your `VS Code` workspace. See https://code.visualstudio.com/docs/python/python-tutorial#_create-a-virtual-environment for a general overview. To get features like intellisense for packages that are installed on the Deephaven server, you will need to install the same packages in your local `venv`.

A `requirements.txt` file can be generated containing all of the packages installed on the server by:
1. Connect to a Deephaven server
1. Right-click on the connection in the CONNECTIONS panel
1. Click "Generate requirements.txt" action

   ![Generate requirements.txt](docs/assets/generate-requirements-txt.png)

> Note: Python code executed by the extension always runs on the server, while the local environment drives language features in `VS Code` such as intellisense. For Community, it is possible for the server to share the same environment as `VS Code`. For Enterprise, they will always be separate.

### Managed Pip Servers (Community only)
If you want to manage Deephaven servers from within the extension, include `deephaven-server` in the venv pip installation.

Once installed, clicking the "refresh" button in the server tree panel should reveal a "Managed" servers node.

![Refresh Servers](./docs/assets/refresh-servers.png)

Hovering over the "Managed" node shows a Play button that starts a server.

![Start Pip Server](./docs/assets/start-pip-server.png)

## Panels
### Servers Panel
The `servers` panel shows the status of all configured servers.

If the `deephaven-server` pip package is available your local workspace, the panel will also show a "Managed" servers node (note that managed servers are Community servers that target the current `VS Code` workspace).

![Servers Panel](./docs/assets/servers-panel.png)

### Connections Panel
The `connections` panel shows all active connections + editors currently associated with them. Hovering over nodes will show additional contextual action icons.

![Connections Panel](./docs/assets/connections-panel.png)

Editors can be dragged from 1 active connection to another.

### Panels Panel
The `panels` panel shows exported variables available on an active connection. Clicking a variable will open or refresh the respective output panel.

![Panels Panel](./docs/assets/panels-panel.png)