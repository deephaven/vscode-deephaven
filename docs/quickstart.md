# Deephaven in Vscode - Quickstart

## Installation

The Deephaven in Vscode extension can be installed from the [Vscode Marketplace](https://marketplace.visualstudio.com/items?itemName=deephaven.vscode-deephaven) or from the extension browser inside of `vscode`. The extension is currently `pre-release`, so you'll need to install it as such.

![Install Deephaven in Vscode Extension](./images/installation-pre-release.png)

Once installed, there will be a new icon in the `activity bar` (the sidebar containing navigation icons). Clicking the Deephaven icon will show a new panel containing details of configured Deephaven servers. By default, the extension is configured to connect to a single Community server hosted at `http:localhost:10000`.

![Vscode Activity Bar](./images/dh-activty-bar.gif)

The "SERVERS" tree will show the status of any configured servers.

![Server Status](./images/server-status.png)

To run a script against a running server, simply click the `Run Deephaven File` action at the top of a file supported by the server.

![Connect to Community Server](./images/dhc-connect-to-server.gif)

A new connection will show up in the "CONNECTIONS" tree, and the "PANELS" should show any variables exposed on the connection. To disconnect, hover over the connection item and click the trash icon.

## Configuration

Community servers can be configured via the `"deephaven.coreServers"` setting in vscode user or workspace settings.

![Community Server Settings](./images/add-community-server.gif)

Enterprise servers can be configured via the `"deephaven.enterpriseServers"` setting in vscode user or workspace settings.

![Enterprise Server Settings](./images/dhe-settings.gif)

## Workspace Setup
It is recommended to configure a virtual python environment within your `vscode` workspace. See https://code.visualstudio.com/docs/python/python-tutorial#_create-a-virtual-environment for a general overview. To get features like intellisense, you can install `deephaven` pip packages in the `venv`.

For example here's a minimal `requirements.text` file that will enable intellisense for common DH packages:
```text
deephaven-core
deephaven-plugin-plotly-express
deephaven-plugin-ui
```

### Managed Pip Servers
If you want to manage DH servers from within the extension, you can include `deephaven-server` in the pip installation.

Once installed, clicking the "refresh" button in the server tree panel should reveal a "Managed" servers node.

![Refresh Servers](./images/refresh-servers.png)

Hovering over the "Managed" node should show a play button. Clicking it will start a server.

![Start Pip Server](./images/start-pip-server.png)

## Panels
### Servers Panel
The `servers` panel shows the status of all configured servers. If the `deephaven-server` pip package is available your workspace, the panel will also show a "Managed" servers node.

![Servers Panel](./images/servers-panel.png)

### Connections Panel
The `connections` panel shows all active connections + editors currently associated with them. Hovering over nodes will show additional contextual action icons.

![Connections Panel](./images/connections-panel.png)

Editors can be dragged from 1 active connection to another.

### Panels Panel
The `panels` panel shows exported variables available on an active connection. Clicking a variable will open or refresh the respective output panel.

![Panels Panel](./images/panels-panel.png)