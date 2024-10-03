import { randomUUID } from 'node:crypto';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import type {
  EnterpriseDhType as DheType,
  EditableQueryInfo,
  EnterpriseClient,
  QueryInfo,
} from '@deephaven-enterprise/jsapi-types';
import { DraftQuery, QueryScheduler } from '@deephaven-enterprise/query-utils';
import type { WorkerInfo } from '../types';

const INTERACTIVE_CONSOLE_QUERY_TYPE = 'InteractiveConsole';

export type IDraftQuery = EditableQueryInfo & {
  isClientSide: boolean;
  draftOwner: string;
};

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

export async function getWorkerCredentials(
  client: EnterpriseClient
): Promise<DhcType.LoginCredentials> {
  const token = await client.createAuthToken('RemoteQueryProcessor');
  return {
    type: 'io.deephaven.proto.auth.Token',
    token,
  };
}

export function getWsUrl(serverUrl: URL): URL {
  const url = new URL('/socket', serverUrl);
  if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  } else {
    url.protocol = 'wss:';
  }
  return url;
}

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

export function findQueryConfigForSerial(
  dheClient: EnterpriseClient,
  matchSerial: string
): QueryInfo | undefined {
  return dheClient
    .getKnownConfigs()
    .find(({ serial }) => serial === matchSerial);
}

export async function createCoreWorker(
  dhe: DheType,
  dheClient: EnterpriseClient
): Promise<WorkerInfo | undefined> {
  const userInfo = await dheClient.getUserInfo();
  const draftQuery = await createDraftQuery(
    dheClient,
    INTERACTIVE_CONSOLE_QUERY_TYPE,
    userInfo.username
  );

  if (draftQuery.serial == null) {
    draftQuery.updateSchedule();
  }

  const serial = await dheClient.createQuery(draftQuery);

  // The query will go through multiple config updates before the worker is ready.
  // This Promise will respond to config update events and resolve when the worker
  // is ready.
  const queryInfo = await new Promise<QueryInfo>(resolve => {
    dheClient.addEventListener(dhe.Client.EVENT_CONFIG_UPDATED, _event => {
      const queryInfo = findQueryConfigForSerial(dheClient, serial);
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
    serial,
    grpcUrl,
    ideUrl,
    processInfoId,
    workerName,
    // dispose: () => (dheClient as any).deleteQueries([serial]),
    // getCredentials: async () => getDheAuthToken(dheClient),
  };
}

export async function deleteWorker(
  dheClient: EnterpriseClient,
  serial: string
): Promise<void> {
  await (dheClient as any).deleteQueries([serial]);
}

export async function createDraftQuery(
  dheClient: EnterpriseClient,
  type: string,
  owner: string
): Promise<DraftQuery> {
  const [dbServers, queryConstants, serverConfigValues] = await Promise.all([
    dheClient.getDbServers(),
    dheClient.getQueryConstants(),
    dheClient.getServerConfigValues(),
  ]);

  const name = `vscode extension - ${randomUUID()}`;
  const dbServerName = dbServers[0]?.name ?? 'Query 1';
  const heapSize = queryConstants.pqDefaultHeap;
  const jvmProfile = serverConfigValues.jvmProfileDefault;
  const scriptLanguage = 'Python'; // TODO: determine from languageid
  // serverConfigValues.scriptSessionProviders?.[0] ?? 'Python';
  const workerKind = serverConfigValues.workerKinds?.[0]?.name;

  const timeZone =
    serverConfigValues.timeZone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone;

  const scheduling = QueryScheduler.makeDefaultScheduling(
    serverConfigValues.restartQueryWhenRunningDefault,
    timeZone
  );

  return new DraftQuery({
    isClientSide: true,
    draftOwner: owner,
    name,
    type,
    owner,
    dbServerName,
    heapSize: heapSize && 0.5, // TODO: set this to default
    scheduling,
    jvmArgs: '-Dhttp.websockets=true', // TODO: Probably need to connect securely
    jvmProfile,
    scriptLanguage,
    workerKind,
  });
}
