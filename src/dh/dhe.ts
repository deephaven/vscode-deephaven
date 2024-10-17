import type { dh as DhcType } from '@deephaven/jsapi-types';
import type {
  EnterpriseDhType as DheType,
  EditableQueryInfo,
  EnterpriseClient,
  QueryInfo,
  TypeSpecificFields,
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
import {
  DEFAULT_TEMPORARY_QUERY_AUTO_TIMEOUT_MS,
  DEFAULT_TEMPORARY_QUERY_TIMEOUT_MS,
  INTERACTIVE_CONSOLE_QUERY_TYPE,
  INTERACTIVE_CONSOLE_TEMPORARY_QUEUE_NAME,
} from '../common';

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
  const queueName = INTERACTIVE_CONSOLE_TEMPORARY_QUEUE_NAME;
  const autoDeleteTimeoutMs = DEFAULT_TEMPORARY_QUERY_AUTO_TIMEOUT_MS;
  const timeout = DEFAULT_TEMPORARY_QUERY_TIMEOUT_MS;

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

  const autoDelete = autoDeleteTimeoutMs > 0;

  const typeSpecificFields: TypeSpecificFields<string> | null =
    autoDeleteTimeoutMs > 0
      ? {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          TerminationDelay: {
            type: 'long',
            value: String(autoDeleteTimeoutMs),
          },
        }
      : null;

  const scheduling = QueryScheduler.makeTemporaryScheduling({
    autoDelete,
    queueName,
  });

  const draftQuery = new DraftQuery({
    isClientSide: true,
    draftOwner: owner,
    name,
    type,
    owner,
    dbServerName,
    heapSize: heapSize,
    scheduling,
    // We have to use websockets since http2 is not sufficiently supported in
    // the nodejs environment (v20 at time of this comment).
    jvmArgs: '-Dhttp.websockets=true',
    jvmProfile,
    scriptLanguage,
    timeout,
    typeSpecificFields,
    workerKind,
  });

  if (draftQuery.serial == null) {
    draftQuery.updateSchedule();
  }

  // type assertion gives us stronger type safety than the Promise<string>
  // return type defined by the JS API types.
  const serial = (await dheClient.createQuery(draftQuery)) as QuerySerial;

  // Temporary queries don't auto start, so we need to start it manually.
  dheClient.restartQueries([serial]);

  return serial;
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
    dheClient.addEventListener(
      dhe.Client.EVENT_CONFIG_UPDATED,
      ({ detail: queryInfo }: CustomEvent<QueryInfo>) => {
        if (
          queryInfo.serial === querySerial &&
          queryInfo.designated?.grpcUrl != null
        ) {
          resolve(queryInfo);
        }
      }
    );
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
