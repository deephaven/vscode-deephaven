import type { dh as DhcType } from '@deephaven/jsapi-types';
import type {
  EnterpriseDhType as DheType,
  EditableQueryInfo,
  EnterpriseClient,
  QueryInfo,
} from '@deephaven-enterprise/jsapi-types';
import { DraftQuery, QueryScheduler } from '@deephaven-enterprise/query-utils';
import type {
  ConsoleType,
  IdeURL,
  QuerySerial,
  UniqueID,
  WorkerInfo,
  WorkerURL,
} from '../types';

const INTERACTIVE_CONSOLE_QUERY_TYPE = 'InteractiveConsole';

export type IDraftQuery = EditableQueryInfo & {
  isClientSide: boolean;
  draftOwner: string;
};

/**
 * Create DHE client.
 * @param dhe DHE JsApi
 * @param serverUrl Server URL
 * @returns A promise that resolves to the DHE client.
 */
export async function createDheClient(
  dhe: DheType,
  serverUrl: URL
): Promise<EnterpriseClient> {
  const dheClient = new dhe.Client(serverUrl.toString());

  return new Promise(resolve => {
    const unsubscribe = dheClient.addEventListener(
      dhe.Client.EVENT_CONNECT,
      () => {
        unsubscribe();
        resolve(dheClient);
      }
    );
  });
}

/**
 * Get credentials for a Core+ worker associated with a given DHE client.
 * @param client The DHE client.
 * @returns A promise that resolves to the worker credentials.
 */
export async function getWorkerCredentials(
  client: EnterpriseClient
): Promise<DhcType.LoginCredentials> {
  const token = await client.createAuthToken('RemoteQueryProcessor');
  return {
    type: 'io.deephaven.proto.auth.Token',
    token,
  };
}

/**
 * Get the WebSocket URL for a DHE server URL.
 * @param serverUrl The DHE server URL.
 * @returns The WebSocket URL.
 */
export function getWsUrl(serverUrl: URL): URL {
  const url = new URL('/socket', serverUrl);
  if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  } else {
    url.protocol = 'wss:';
  }
  return url;
}

/**
 * Determine if the logged in user has permission to interact with the UI.
 * @param dheClient The DHE client.
 * @returns A promise that resolves to true if the user has permission to interact with the UI.
 */
export async function hasInteractivePermission(
  dheClient: EnterpriseClient
): Promise<boolean> {
  // TODO: Retrieve these group names from the server:
  // https://deephaven.atlassian.net/browse/DH-9418
  const GROUP_NON_INTERACTIVE = 'deephaven-noninteractive';
  const GROUP_SUPERUSERS = 'iris-superusers';

  const groups = await dheClient.getGroupsForUser();

  const isSuperUser = groups.indexOf(GROUP_SUPERUSERS) >= 0;
  const isNonInteractive = groups.indexOf(GROUP_NON_INTERACTIVE) >= 0;
  const isInteractive = !isNonInteractive;

  return isSuperUser || isInteractive;
}

/**
 * Find the `QueryInfo` matching the given serial.
 * @param dheClient DHE client to search.
 * @param matchSerial Serial to match.
 * @returns The matching `QueryInfo` or `undefined` if not found.
 */
export function findQueryConfigForSerial(
  dheClient: EnterpriseClient,
  matchSerial: string
): QueryInfo | undefined {
  return dheClient
    .getKnownConfigs()
    .find(({ serial }) => serial === matchSerial);
}

/**
 * Create a query of type `InteractiveConsole`.
 * @param tagId Unique tag id to include in the query name.
 * @param dheClient The DHE client to use to create the query.
 * @param consoleType The type of console to create.
 * @returns A promise that resolves to the serial of the created query. Note
 * that this will resolve before the query is actually ready to use. Use
 * `getWorkerInfoFromQuery` to get the worker info when the query is ready.
 */
export async function createInteractiveConsoleQuery(
  tagId: UniqueID,
  dheClient: EnterpriseClient,
  consoleType?: ConsoleType
): Promise<QuerySerial> {
  const userInfo = await dheClient.getUserInfo();
  const owner = userInfo.username;
  const type = INTERACTIVE_CONSOLE_QUERY_TYPE;

  const [dbServers, queryConstants, serverConfigValues] = await Promise.all([
    dheClient.getDbServers(),
    dheClient.getQueryConstants(),
    dheClient.getServerConfigValues(),
  ]);

  const name = `IC - VS Code - ${tagId}`;
  const dbServerName = dbServers[0]?.name ?? 'Query 1';
  const heapSize = queryConstants.pqDefaultHeap;
  const jvmProfile = serverConfigValues.jvmProfileDefault;
  const scriptLanguage =
    serverConfigValues.scriptSessionProviders?.find(
      p => p.toLocaleLowerCase() === consoleType
    ) ?? 'Python';
  const workerKind = serverConfigValues.workerKinds?.[0]?.name;

  const timeZone =
    serverConfigValues.timeZone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone;

  const scheduling = QueryScheduler.makeDefaultScheduling(
    serverConfigValues.restartQueryWhenRunningDefault,
    timeZone
  );

  const draftQuery = new DraftQuery({
    isClientSide: true,
    draftOwner: owner,
    name,
    type,
    owner,
    dbServerName,
    heapSize: heapSize,
    scheduling,
    // TODO: deephaven/vscode-deephaven/issues/153 to update this to secure websocket connection
    jvmArgs: '-Dhttp.websockets=true',
    jvmProfile,
    scriptLanguage,
    workerKind,
  });

  if (draftQuery.serial == null) {
    draftQuery.updateSchedule();
  }

  // type assertion gives us stronger type safety than the Promise<string>
  // return type defined by the JS API types.
  return dheClient.createQuery(draftQuery) as Promise<QuerySerial>;
}

/**
 * Delete queries by serial.
 * @param dheClient DHE client to use.
 * @param querySerials Serials of queries to delete.
 */
export async function deleteQueries(
  dheClient: EnterpriseClient,
  querySerials: QuerySerial[]
): Promise<void> {
  await dheClient.deleteQueries(querySerials);
}

/**
 * Get worker info from a query serial.
 * @param tagId Unique tag id to include in the worker info.
 * @param dhe DHE JsApi instance.
 * @param dheClient DHE client to use.
 * @param querySerial Serial of the query to get worker info for.
 * @returns A promise that resolves to the worker info when the worker is ready.
 */
export async function getWorkerInfoFromQuery(
  tagId: UniqueID,
  dhe: DheType,
  dheClient: EnterpriseClient,
  querySerial: QuerySerial
): Promise<WorkerInfo | undefined> {
  // The query will go through multiple config updates before the worker is ready.
  // This Promise will respond to config update events and resolve when the worker
  // is ready.
  const queryInfo = await new Promise<QueryInfo>(resolve => {
    dheClient.addEventListener(dhe.Client.EVENT_CONFIG_UPDATED, _event => {
      const queryInfo = findQueryConfigForSerial(dheClient, querySerial);
      if (queryInfo?.designated?.grpcUrl != null) {
        resolve(queryInfo);
      }
    });
  });

  if (queryInfo.designated == null) {
    return;
  }

  const { grpcUrl, ideUrl, processInfoId, workerName } = queryInfo.designated;

  return {
    tagId,
    serial: querySerial,
    grpcUrl: new URL(grpcUrl) as WorkerURL,
    ideUrl: new URL(ideUrl) as IdeURL,
    processInfoId,
    workerName,
  };
}
