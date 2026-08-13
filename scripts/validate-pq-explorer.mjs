// @ts-check
/**
 * Headless validation for the Persistent Queries explorer plumbing.
 *
 * Proves — WITHOUT the extension UI — that against a live Core+ (Deephaven
 * Enterprise) server we can:
 *   1. build a `CorePlusManager`,
 *   2. fetch the ticking `QueryInfo` table,
 *   3. apply the PQ-explorer server-side filter (non-helper types, any status),
 *   4. print the filtered PQ rows from a full table subscription, and confirm
 *      every row's serial resolves to a known config,
 *   5. pick one running non-InteractiveConsole PQ and enumerate its exported
 *      objects (from `queryInfo.designated.objects`, the same source the tree
 *      provider uses — no console session / no `initSession`).
 *
 * This is DEFERRED to the requester: it cannot run in the devcontainer (no live
 * server). Run it from a machine with network access to a Core+ server.
 *
 * Usage:
 *   DHE_SERVER_URL=https://my-dhe:8123 \
 *   DHE_USERNAME=me DHE_PASSWORD=secret \
 *   node scripts/validate-pq-explorer.mjs
 *
 * Requires the same `@deephaven-enterprise/*` packages the extension depends on
 * (already installed). `NODE_EXTRA_CA_CERTS` may be needed for self-signed /
 * internal-CA servers (see the jsapi-nodejs README).
 */

import { initCorePlusManager } from '@deephaven-enterprise/jsapi-nodejs';
import { createPasswordCredentials } from '@deephaven-enterprise/auth-nodejs';
import {
  makeFactoryServiceTablePromise,
  QueryColumns,
  QUERY_CONFIG_TABLE,
  EXCLUDED_QUERY_TYPES,
  WEB_CLIENT_DATA_CORE_QUERY,
} from '@deephaven-enterprise/query-utils';

const INTERACTIVE_CONSOLE_QUERY_TYPE = 'InteractiveConsole';

function requireEnv(name) {
  const value = process.env[name];
  if (value == null || value === '') {
    console.error(`Missing required env var: ${name}`);
    process.exit(2);
  }
  return value;
}

async function main() {
  const serverUrl = new URL(requireEnv('DHE_SERVER_URL'));
  const username = requireEnv('DHE_USERNAME');
  const password = requireEnv('DHE_PASSWORD');

  console.log(`Connecting to ${serverUrl} as ${username}...`);

  const manager = await initCorePlusManager({
    serverUrl,
    credentials: createPasswordCredentials(username, password),
  });

  try {
    const dheClient = manager.dheClient;
    const dhe = manager.dhe;
    const userInfo = await dheClient.getUserInfo();

    // Guard: WebClientData must be running + visible (Gotcha 7).
    const hasWebClientData = dheClient
      .getKnownConfigs()
      .some(
        qi =>
          qi.name === WEB_CLIENT_DATA_CORE_QUERY &&
          qi.designated?.status === 'Running'
      );
    if (!hasWebClientData) {
      console.error(
        `'${WEB_CLIENT_DATA_CORE_QUERY}' is not running/visible — cannot load the QueryInfo table.`
      );
      process.exit(1);
    }

    console.log(`Fetching '${QUERY_CONFIG_TABLE}' table...`);
    const webClientData = dheClient
      .getKnownConfigs()
      .find(
        qi =>
          qi.name === WEB_CLIENT_DATA_CORE_QUERY &&
          qi.designated?.status === 'Running'
      );

    const table = await makeFactoryServiceTablePromise({
      client: dheClient,
      corePlusManager: manager,
      dh: dhe,
      userInfo,
      tableName: QUERY_CONFIG_TABLE,
    });

    // The table is created by the WebClientData worker's *community* API, so
    // filter values must be built from that same API — a FilterValue from the
    // enterprise `dhe` API throws java.lang.ClassCastException when the table
    // casts it. `getApi` returns the cached instance the factory used above.
    const coreApi = await manager.getApi(
      webClientData.workerKind,
      webClientData.designated.jsApiUrl
    );

    // Dump the actual runtime column types so we can see how Status/QueryType
    // are really typed on the server (QueryColumns metadata is the new-table
    // schema, not necessarily the runtime QueryInfo table type).
    console.log('\nColumns (name: type):');
    for (const col of table.columns) {
      console.log(`  ${col.name}: ${col.type}`);
    }
    console.log();

    // Server-side filter: exclude InteractiveConsole + other helper/system
    // types. Deliberately NOT filtered by status — stopped/failed PQs list too,
    // mirroring `PersistentQueryService`. Filter values come from `coreApi` (the
    // table's own API), not `dhe`.
    const excludeTypeFilter = table
      .findColumn(QueryColumns.QUERY_TYPE.name)
      .filter()
      .in([...EXCLUDED_QUERY_TYPES].map(t => coreApi.FilterValue.ofString(t)))
      .not();

    console.log(
      `Unfiltered '${QUERY_CONFIG_TABLE}' size (pre-settle): ${table.size}`
    );

    // Poll until the (unfiltered) size settles, so we can distinguish "table
    // never populates" (server-side/ACL/factory problem) from "viewport never
    // covered the rows" (client-side bug).
    for (let i = 0; i < 20 && table.size === 0; i++) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    console.log(
      `Unfiltered '${QUERY_CONFIG_TABLE}' size (settled): ${table.size}`
    );

    table.applyFilter([excludeTypeFilter]);

    const serialColumn = table.findColumn(QueryColumns.SERIAL.name);
    const nameColumn = table.findColumn(QueryColumns.NAME.name);
    const statusColumn = table.findColumn(QueryColumns.STATUS.name);
    const parentColumn = table.findColumn(QueryColumns.PARENT_ID.name);

    // Subscribe to the whole filtered table rather than tracking a viewport:
    // `getViewportData()` only returns the snapshot that has arrived so far, so
    // rows ticking in later were silently dropped. Mirrors
    // `QueryConfigTableService`.
    const tableSubscription = table.subscribe([
      serialColumn,
      nameColumn,
      statusColumn,
      parentColumn,
    ]);

    /** @type {{serial: string, name: string, status: string}[]} */
    let queries = [];
    tableSubscription.addEventListener(
      coreApi.Table.EVENT_UPDATED,
      ({ detail }) => {
        queries = detail.rows
          .filter(row => {
            const parent = row.get(parentColumn);
            return parent == null || String(parent).length === 0;
          })
          .map(row => ({
            serial: String(row.get(serialColumn)),
            name: String(row.get(nameColumn)),
            status: String(row.get(statusColumn)),
          }));
      }
    );

    // Give the subscription a moment to deliver its first tick.
    for (let i = 0; i < 20 && queries.length === 0; i++) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    console.log(`Filtered '${QUERY_CONFIG_TABLE}' size: ${table.size}`);

    console.log(`\nFiltered non-helper PQs, any status (${queries.length}):`);
    const serials = [];
    for (const { serial, name, status } of queries) {
      serials.push(serial);
      console.log(`  - ${name} [${status}]  [serial ${serial}]`);
    }

    // Every table serial must resolve to a known config — an unresolved serial
    // is a PQ that would silently vanish from the tree.
    const knownSerials = new Set(
      dheClient.getKnownConfigs().map(qi => String(qi.serial))
    );
    const unresolved = serials.filter(serial => !knownSerials.has(serial));
    console.log(
      `\nTable serials with no known config (expected 0): ${unresolved.length}` +
        (unresolved.length > 0 ? ` — ${unresolved.join(', ')}` : '')
    );

    // Resolve one PQ's full QueryInfo and enumerate its objects.
    const pq = dheClient
      .getKnownConfigs()
      .find(
        qi =>
          qi.serial != null &&
          serials.includes(String(qi.serial)) &&
          qi.type !== INTERACTIVE_CONSOLE_QUERY_TYPE &&
          qi.designated?.status === 'Running'
      );

    if (pq == null) {
      console.log('\nNo running non-IC PQ available to enumerate objects for.');
    } else {
      const objects = pq.designated?.objects ?? [];
      console.log(
        `\nObjects for PQ '${pq.name}' (worker ${pq.designated?.jsApiUrl}):`
      );
      for (const obj of objects) {
        console.log(`  - ${obj.title} (${obj.type})`);
      }
    }

    tableSubscription.close();
    table.close();
    console.log('\nDone.');
  } finally {
    await manager.dispose();
  }
}

main().catch(err => {
  console.error('Validation failed:', err);
  process.exit(1);
});
