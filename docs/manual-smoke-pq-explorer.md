# Manual Smoke — Persistent Queries Explorer

These checks verify the **Persistent Queries** tree view (browse ACL-visible
non-InteractiveConsole PQs and open their objects read-only). They require a live
Core+ (Deephaven Enterprise) server with the always-on `WebClientData` system
query running, and **cannot** be run in the devcontainer (the extension UI does
not run there). Run them from a full VS Code instance connected to a real server.

The automated gates (`npm run build:ts`, `npm run test:unit`,
`npm run test:lint`) are the developer bar; the items below are the
requester-run verification.

## Headless plumbing check (optional, no UI)

Proves the table filter + non-console object enumeration without the extension:

```
DHE_SERVER_URL=https://my-dhe:8123 \
DHE_USERNAME=me DHE_PASSWORD=secret \
node scripts/validate-pq-explorer.mjs
```

- [ ] Prints the filtered running non-InteractiveConsole PQ rows.
- [ ] Prints the exported objects of one running non-IC PQ.
  (`NODE_EXTRA_CA_CERTS` may be needed for self-signed / internal-CA servers.)

## UI smoke

### List

- [ ] Connect to a DHE server. The **Persistent Queries** view (in the Deephaven
  activity-bar container, below **Panels**) shows the DHE server node.
- [ ] Expanding the server node lists **running non-InteractiveConsole** PQs
  (owner shown as the node description). InteractiveConsole workers do **not**
  appear here — they remain in the **Workers** tree.
- [ ] The list reflects server-side changes: start/stop a PQ from another client
  (e.g. the web UI); the tree updates within a few seconds (table tick). Use the
  title-bar refresh action to force a refresh.

### Open objects

- [ ] Expand a running PQ node. Its exported objects (tables, figures, widgets)
  are listed as leaves with the correct type icons.
- [ ] Click a **Table** object. It opens read-only in a `dhPanel` webview and
  renders data.
- [ ] Click a **Figure** object. It opens read-only in a `dhPanel` webview and
  renders.
- [ ] No console session is created for the PQ: it does **not** appear in the
  **Workers** tree, the server's worker/connection count is unchanged, and no
  "Created Deephaven session" toast appears.

### Ownership / lifecycle invariants

- [ ] Close the object panels and collapse the PQ node — the server-side PQ keeps
  running (it is never deleted by this view).
- [ ] Disconnect the DHE server — the Persistent Queries view empties for that
  server and no residual browse connections leak; the PQ (owned by whoever
  created it) is left running server-side.
- [ ] Reconnect — the PQ list repopulates and objects can be opened again.
