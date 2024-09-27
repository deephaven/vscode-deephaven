import { randomUUID } from 'node:crypto';
import type {
  EnterpriseDhType as DheType,
  EditableQueryInfo,
  EnterpriseClient,
} from '@deephaven-enterprise/jsapi-types';
import { DraftQuery, QueryScheduler } from '@deephaven-enterprise/query-utils';

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

export async function getDheAuthToken(
  client: EnterpriseClient
): Promise<{ type: string; token: string }> {
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

export async function createDraftQuery(
  dheClient: EnterpriseClient,
  owner: string
): Promise<IDraftQuery> {
  const [dbServers, queryConstants, serverConfigValues] = await Promise.all([
    dheClient.getDbServers(),
    dheClient.getQueryConstants(),
    dheClient.getServerConfigValues(),
  ]);

  const name = `vscode extension - ${randomUUID()}`;
  const dbServerName = dbServers[0]?.name ?? 'Query 1';
  const heapSize = queryConstants.pqDefaultHeap;
  const jvmProfile = serverConfigValues.jvmProfileDefault;
  const scriptLanguage =
    serverConfigValues.scriptSessionProviders?.[0] ?? 'Python';
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
    owner,
    dbServerName,
    heapSize,
    scheduling,
    jvmProfile,
    scriptLanguage,
    workerKind,
  });
}
