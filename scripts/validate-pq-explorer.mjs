// @ts-check
/**
 * Headless validation for the Persistent Queries explorer plumbing.
 *
 * Proves — WITHOUT the extension UI — that against a live Core+ (Deephaven
 * Enterprise) server we can:
 *   1. build a `CorePlusManager`,
 *   2. fetch the ticking `QueryInfo` table,
 *   3. apply the PQ-explorer server-side filter (running, non-helper types),
 *   4. print the filtered PQ rows,
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
    const table = await makeFactoryServiceTablePromise({
      client: dheClient,
      corePlusManager: manager,
      dh: dhe,
      userInfo,
      tableName: QUERY_CONFIG_TABLE,
    });

    // Server-side filter: running, excluding helper/system types (which include
    // InteractiveConsole). Mirrors the tree provider's filter (Decision 3).
    const statusFilter = table
      .findColumn(QueryColumns.STATUS.name)
      .filter()
      .in([dhe.FilterValue.ofString('Running')]);

    const excludeTypeFilter = table
      .findColumn(QueryColumns.QUERY_TYPE.name)
      .filter()
      .in([...EXCLUDED_QUERY_TYPES].map(t => dhe.FilterValue.ofString(t)))
      .not();

    table.applyFilter([statusFilter, excludeTypeFilter]);
    table.setViewport(0, Math.max(0, table.size - 1));

    // Give the viewport a moment to populate.
    await new Promise(resolve => setTimeout(resolve, 2000));

    const viewportData = await table.getViewportData();
    const serialColumn = table.findColumn(QueryColumns.SERIAL.name);
    const nameColumn = table.findColumn(QueryColumns.NAME.name);
    const parentColumn = table.findColumn(QueryColumns.PARENT_ID.name);

    console.log(`\nFiltered running non-helper PQs (${viewportData.rows.length}):`);
    const serials = [];
    for (const row of viewportData.rows) {
      const parent = row.get(parentColumn);
      if (parent != null && String(parent).length > 0) {
        continue; // skip child-replica rows
      }
      const serial = String(row.get(serialColumn));
      serials.push(serial);
      console.log(`  - ${row.get(nameColumn)}  [serial ${serial}]`);
    }

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
