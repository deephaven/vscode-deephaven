import type { dh as DhcType } from '@deephaven/jsapi-types';
import type {
  EnterpriseDhType as DheType,
  EditableQueryInfo,
  QueryInfo,
  TypeSpecificFields,
} from '@deephaven-enterprise/jsapi-types';
import { DraftQuery, QueryScheduler } from '@deephaven-enterprise/query-utils';
import type { AuthenticatedClient as DheAuthenticatedClient } from '@deephaven-enterprise/auth-nodejs';
import { hasStatusCode, loadModules } from '@deephaven/jsapi-nodejs';
import type {
  ConsoleType,
  IdeURL,
  QuerySerial,
  UniqueID,
  WorkerConfig,
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

declare global {
  // This gets added by the DHE jsapi.
  // eslint-disable-next-line no-unused-vars
  const iris: DheType;
}

export async function getDhe(
  serverUrl: URL,
  storageDir: string
): Promise<DheType> {
  polyfill();

  // Download jsapi `ESM` files from DH Community server.
  await loadModules({
    serverUrl,
    serverPaths: ['irisapi/irisapi.nocache.js'],
    download: true,
    storageDir,
    sourceModuleType: 'cjs',
  });

  // DHE currently exposes the jsapi via the global `iris` object.
  return iris;
}

/**
 * Get credentials for a Core+ worker associated with a given DHE client.
 * @param client The DHE client.
 * @returns A promise that resolves to the worker credentials.
 */
export async function getWorkerCredentials(
  client: DheAuthenticatedClient
): Promise<DhcType.LoginCredentials> {
  const token = await client.createAuthToken('RemoteQueryProcessor');
  return {
    type: 'io.deephaven.proto.auth.Token',
    token,
  };
}

/**
 * Determine if the logged in user has permission to interact with the UI.
 * @param dheClient The DHE client.
 * @returns A promise that resolves to true if the user has permission to interact with the UI.
 */
export async function hasInteractivePermission(
  dheClient: DheAuthenticatedClient
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
 * Check if a given server is running by checking if the `irisapi/irisapi.nocache.js`
 * file is accessible.
 * @param serverUrl
 */
export async function isDheServerRunning(serverUrl: URL): Promise<boolean> {
  try {
    return await hasStatusCode(
      new URL('irisapi/irisapi.nocache.js', serverUrl.toString()),
      [200, 204]
    );
  } catch {
    return false;
  }
}

/**
 * Create a query of type `InteractiveConsole`.
 * @param tagId Unique tag id to include in the query name.
 * @param dheClient The DHE client to use to create the query.
 * @param workerConfig Worker configuration overrides.
 * @param consoleType The type of console to create.
 * @returns A promise that resolves to the serial of the created query. Note
 * that this will resolve before the query is actually ready to use. Use
 * `getWorkerInfoFromQuery` to get the worker info when the query is ready.
 */
export async function createInteractiveConsoleQuery(
  tagId: UniqueID,
  dheClient: DheAuthenticatedClient,
  workerConfig: WorkerConfig = {},
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
  const dbServerName =
    workerConfig?.dbServerName ?? dbServers[0]?.name ?? 'Query 1';
  const heapSize = workerConfig?.heapSize ?? queryConstants.pqDefaultHeap;

  // We have to use websockets since fetch over http2 is not sufficiently
  // supported in the nodejs environment bundled with `vscode` (v20 at time of
  // this comment). Note that the `http` in the key name does not indicate
  // insecure websockets. The connection will be a `wss:` secure connection.
  const jvmArgs = workerConfig?.jvmArgs
    ? `'-Dhttp.websockets=true' ${workerConfig.jvmArgs}`
    : '-Dhttp.websockets=true';

  const jvmProfile =
    workerConfig?.jvmProfile ?? serverConfigValues.jvmProfileDefault;
  const scriptLanguage =
    workerConfig?.scriptLanguage ??
    serverConfigValues.scriptSessionProviders?.find(
      p => p.toLocaleLowerCase() === consoleType
    ) ??
    'Python';
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
    jvmArgs,
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
  dheClient: DheAuthenticatedClient,
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
  dheClient: DheAuthenticatedClient,
  querySerial: QuerySerial
): Promise<WorkerInfo | undefined> {
  // The query will go through multiple config updates before the worker is ready.
  // This Promise will respond to config update events and resolve when the worker
  // is ready.
  const queryInfo = await new Promise<QueryInfo>((resolve, reject) => {
    const removeEventListener = dheClient.addEventListener(
      dhe.Client.EVENT_CONFIG_UPDATED,
      ({ detail: queryInfo }: CustomEvent<QueryInfo>) => {
        if (queryInfo.serial !== querySerial) {
          return;
        }

        switch (queryInfo.designated?.status) {
          case 'Running':
            removeEventListener();
            resolve(queryInfo);
            break;
          case 'Error':
          case 'Failed':
            removeEventListener();
            reject(new Error('Query failed to start'));
            deleteQueries(dheClient, [querySerial]);
            break;
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

export function polyfill(): void {
  // These will eventually not be needed once JSAPI is updated to not rely on `window` and `self`.
  // @ts-ignore
  globalThis.self = globalThis;
  // @ts-ignore
  globalThis.window = globalThis;

  // This is needed to mimic running in a local http browser environment when
  // making requests to the server. This at least impacts websocket connections.
  // Not sure if it is needed for other requests. The url is an arbitrary
  // non-https url just to make it stand out in logs.
  // @ts-ignore
  global.window.location = new URL('http://vscode-deephaven.localhost/');
}
