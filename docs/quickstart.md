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