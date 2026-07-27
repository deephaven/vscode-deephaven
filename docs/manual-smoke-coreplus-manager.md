# Manual Smoke — Shared CorePlusManager Substrate

These checks verify the `EnterpriseCorePlusManager` substrate added to
`DheService` (Phase 1) and the `QueryConfigTableService` (Phase 2). They require
a live Core+ (Deephaven Enterprise) server with the always-on `WebClientData`
system query running, and **cannot** be run in the devcontainer (the extension
UI does not run there). Run them from a full VS Code instance connected to a
real server.

The automated gates (`npm run build:ts`, `npm run test:unit`,
`npm run test:lint`) are the developer bar; the items below are the
requester-run verification.

## (a) Attach-to-workers flow is unchanged (regression)

Worker-attach discovery still runs on the DHE config-event stream and is **not**
routed through the manager or the `QueryInfo` table (Decision 3). Re-run the
existing attach behavior with the manager now present in-tree and confirm each
case is unchanged:

- [ ] **Create-on-empty** — connect to a DHE server with no running IC workers;
  exactly one worker is created and attached.
- [ ] **Auto-attach-on-external-create** — with the server connected, create a
  running IC worker from another client (e.g. the web UI). It is auto-attached
  in the WORKERS tree within a few seconds.
- [ ] **No-delete-on-detach** — detach an *attached* (not extension-created)
  worker; the server-side PQ keeps running.
- [ ] **Delete-owned-on-disconnect** — disconnect the DHE server; workers the
  extension created are deleted, attached workers are left running.

## (b) Manager is disposed on server disconnect

- [ ] Disconnect the DHE server (or log out). Confirm the `CorePlusManager` is
  disposed: no residual Core+ worker connections remain open, and no
  post-dispose config-event handling / log spam occurs from the manager.
- [ ] Reconnect to the same server. A **new** manager is built from the fresh
  client on next use (e.g. opening the PQ table), and only **one**
  authenticated DHE session exists per server (verify via server-side session
  count / logs — no second login is triggered by manager creation).

## (c) QueryInfo table service returns and ticks

Using a scratch consumer of `QueryConfigTableService.getQueryInfoTable(...)`
(or the PQ explorer once built):

- [ ] The service returns a filtered, ticking `QueryInfo` table subscription.
- [ ] A PQ status change made from another client (e.g. stopping/starting a
  query) is reflected in the subscription's `onDidUpdate` snapshots within
  ~5 seconds.
- [ ] If `WebClientData` is stopped / not visible to the user, the service
  throws a clear `WebClientDataUnavailableError` instead of hanging (Gotcha 7).
