# Deephaven VS Code Extension - Usage

This section deals with the different ways you can run code against a running Deephaven server.

## From source code

You can execute entire files or selected code in files as queries against a running Deephaven server with this extension. To do so, your file needs to match the language of the server you are connecting to (Python or Groovy). You can use the command palette, context menu, editor toolbar actions, or click the `Run Deephaven File` button atop the editor.

![Run Deephaven file](assets/dhc-connect-to-server.gif)

A new connection will appear in the [`CONNECTIONS` panel](#connections) on the left-hand side of VS Code when you execute the code. Additionally, the [`PANELS` tree](#panels) below will show any variables exposed in the connection. To disconnect, hover over the connection item and click the trash icon.

## Markdown Code Blocks

The extension also supports running code blocks in markdown files. Like with [running entire files](#run-code-against-a-deephaven-server), the code block must match the language of the server you are connecting to. Atop the code block, click the `Run Deephaven Block` action.

![Run Deephaven block](assets/markdown-codeblocks.png)