import type { dh as DhcType } from '@deephaven/jsapi-types';
import type {
  EnterpriseDhType as DheType,
  EditableQueryInfo,
  EnterpriseClient,
  QueryInfo,
  TypeSpecificFields,
  WorkerKind,
} from '@deephaven-enterprise/jsapi-types';
import { DraftQuery, QueryScheduler } from '@deephaven-enterprise/query-utils';
import type {
  AuthenticatedClient as DheAuthenticatedClient,
  UnauthenticatedClient as DheUnauthenticatedClient,
} from '@deephaven-enterprise/auth-nodejs';
import { hasStatusCode, loadModules } from '@deephaven/jsapi-nodejs';
import type {
  AuthConfig,
  ConsoleType,
  DheAuthenticatedClientWrapper,
  DheServerFeatures,
  DheUnauthenticatedClientWrapper,
  GrpcURL,
  IdeURL,
  JsapiURL,
  UniqueID,
  WorkerConfig,
  WorkerInfo,
  WorkerURL,
} from '../types';
import {
  AUTH_CONFIG_CUSTOM_LOGIN_CLASS_SAML_AUTH,
  AUTH_CONFIG_PASSWORDS_ENABLED,
  AUTH_CONFIG_SAML_LOGIN_URL,
  AUTH_CONFIG_SAML_PROVIDER_NAME,
  DEFAULT_TEMPORARY_QUERY_AUTO_TIMEOUT_MS,
  DEFAULT_TEMPORARY_QUERY_TIMEOUT_MS,
  DHE_FEATURES_URL_PATH,
  INTERACTIVE_CONSOLE_QUERY_TYPE,
  INTERACTIVE_CONSOLE_TEMPORARY_QUEUE_NAME,
  PROTOCOL,
  UnsupportedFeatureQueryError,
} from '../common';
import { withResolvers } from '../util';
import type { QuerySerial } from '../shared';

export type IDraftQuery = EditableQueryInfo & {
  isClientSide: boolean;
  draftOwner: string;
};

declare global {
  // This gets added by the DHE jsapi.
  // eslint-disable-next-line no-unused-vars
  const iris: DheType;
}

/**
 * Download the DHE jsapi from a running server and return the global `iris` object.
 * @param serverUrl URL of the DHE server to download the api from.
 * @param storageDir Directory to store downloaded jsapi files.
 * @returns A promise that resolves to the DHE jsapi.
 */
export async function getDhe(
  serverUrl: URL,
  storageDir: string
): Promise<DheType> {
  polyfillDhe();

  // Download jsapi `CJS` files from DHE server.
  await loadModules({
    serverUrl,
    serverPaths: ['irisapi/irisapi.nocache.js'],
    download: true,
    storageDir,
    targetModuleType: 'cjs',
  });

  // DHE currently exposes the jsapi via the global `iris` object.
  return iris;
}

/**
 * Get the `features.json` file from the DHE server if it exists. This file
 * contains information about UI features available on the server.
 * @param serverUrl
 * @returns A promise that resolves to the features object
 * @throws An `UnsupportedFeatureQueryError` error if the feature json is not
 * found or a general Error if response is not valid JSON.
 */
export async function getDheFeatures(
  serverUrl: URL
): Promise<DheServerFeatures> {
  const response = await fetch(new URL(DHE_FEATURES_URL_PATH, serverUrl));

  if (
    !response.ok ||
    response.headers.get('content-type') !== 'application/json'
  ) {
    throw new UnsupportedFeatureQueryError(
      'Unsupported feature query',
      serverUrl.toString()
    );
  }

  try {
    return await response.json();
  } catch (err) {
    throw new Error(`Failed to parse DHE features from ${serverUrl}: ${err}`);
  }
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
 * Login the client wrapper with the given login function and credentials.
 * @param unauthenticatedClientWrapper Unauthenticated client wrapper.
 * @param loginFn Login function to use.
 * @param credentials Credentials to use.
 * @returns A promise that resolves to the authenticated client wrapper.
 */
export async function loginClientWrapper<TCredentials>(
  unauthenticatedClientWrapper: DheUnauthenticatedClientWrapper,
  loginFn: (
    unauthenticatedClient: DheUnauthenticatedClient,
    credentials: TCredentials
  ) => Promise<DheAuthenticatedClient>,
  credentials: TCredentials
): Promise<DheAuthenticatedClientWrapper> {
  const client = await loginFn(
    unauthenticatedClientWrapper.client,
    credentials
  );

  return {
    ...unauthenticatedClientWrapper,
    client,
  };
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

  const name = createQueryName(tagId);
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

  const workerKind = serverConfigValues.workerKinds?.filter(
    isCommunityWorkerKind
  )[0]?.name;

  if (workerKind == null) {
    throw new Error('No community worker kinds were found');
  }

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
    heapSize,
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
 * Create a query name based on the tag id.
 * @param tagId Unique tag id to include in the query name.
 * @returns The query name.
 */
export function createQueryName(tagId: UniqueID): string {
  return `IC - VS Code - ${tagId}`;
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
 * Get auth config values from the DHE client.
 * @param dheClient DHE client to use.
 * @returns A promise that resolves to the auth config values.
 */
export async function getDheAuthConfig(
  dheClient: EnterpriseClient
): Promise<AuthConfig> {
  const authConfigMap = Object.fromEntries(
    (await dheClient.getAuthConfigValues()).map(([key, value]) => [key, value])
  );

  // Only consider SAML config if it is complete
  const isSamlEnabled =
    authConfigMap[AUTH_CONFIG_CUSTOM_LOGIN_CLASS_SAML_AUTH] &&
    authConfigMap[AUTH_CONFIG_SAML_PROVIDER_NAME] &&
    authConfigMap[AUTH_CONFIG_SAML_LOGIN_URL];

  const samlConfig = isSamlEnabled
    ? {
        loginClass: authConfigMap[AUTH_CONFIG_CUSTOM_LOGIN_CLASS_SAML_AUTH],
        providerName: authConfigMap[AUTH_CONFIG_SAML_PROVIDER_NAME],
        loginUrl: authConfigMap[AUTH_CONFIG_SAML_LOGIN_URL],
      }
    : null;

  const authConfig: AuthConfig = {
    // DH-16352 will be adding support to DH Web for disabling passwords. We
    // already have a `authentication.passwordsEnabled` config prop on the
    // server, so using that here. If for some reason DH-16352 takes another
    // approach, we may need to update this. As-is, all that has to be done
    // to disable password auth is:
    // 1. Set `authentication.passwordsEnabled` prop to false on server.
    // 2. Include `authentication.passwordsEnabled` in the list of values set in
    // `authentication.client.configuration.list` prop to expose it to
    // `client.getAuthConfigValues()`.
    isPasswordEnabled: authConfigMap[AUTH_CONFIG_PASSWORDS_ENABLED] !== 'false',
    samlConfig,
  };

  return authConfig;
}

/**
 * Search existing queries for a query with the given tag id and return its serial.
 * @param tagId Unique tag id to search for.
 * @param dheClient DHE client to use for searching queries.
 * @returns The serial of the query with the given tag id, or null if not found.
 */
export function getSerialFromTagId(
  tagId: UniqueID,
  dheClient: DheAuthenticatedClient
): QuerySerial | null {
  const queryConfig = dheClient
    .getKnownConfigs()
    .find(({ name }) => name === createQueryName(tagId));

  return (queryConfig?.serial ?? null) as QuerySerial | null;
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
  /**
   * Determine the state of a given query info.
   * @returns The query info if it is running or undefined if it is not.
   * @throws An error if the query is in an error state.
   */
  function handleQueryInfo(queryInfo: QueryInfo): QueryInfo | undefined {
    switch (queryInfo.designated?.status) {
      case 'Running':
        return queryInfo;

      case 'Error':
      case 'Failed':
        deleteQueries(dheClient, [querySerial]);
        throw new Error('Query failed to start');

      default:
        return undefined;
    }
  }

  let queryInfo = dheClient
    .getKnownConfigs()
    .find(({ serial }) => serial === querySerial);

  if (queryInfo != null) {
    queryInfo = handleQueryInfo(queryInfo);
  }

  if (queryInfo == null) {
    const { promise, resolve, reject } = withResolvers<QueryInfo>();

    const removeEventListener = dheClient.addEventListener(
      dhe.Client.EVENT_CONFIG_UPDATED,
      ({ detail: queryInfo }: CustomEvent<QueryInfo>) => {
        if (queryInfo.serial !== querySerial) {
          return;
        }

        try {
          const result = handleQueryInfo(queryInfo);
          if (result != null) {
            resolve(result);
          }
        } catch (err) {
          reject(err);
        }
      }
    );

    try {
      queryInfo = await promise;
    } finally {
      removeEventListener();
    }
  }

  if (queryInfo.designated == null) {
    return;
  }

  const { envoyPrefix, grpcUrl, ideUrl, jsApiUrl, processInfoId, workerName } =
    queryInfo.designated;

  const workerUrl = new URL(jsApiUrl) as WorkerURL;
  workerUrl.pathname = workerUrl.pathname.replace(/jsapi\/dh-core.js$/, '');

  return {
    tagId,
    serial: querySerial,
    envoyPrefix,
    grpcUrl: new URL(grpcUrl) as GrpcURL,
    ideUrl: new URL(ideUrl) as IdeURL,
    jsapiUrl: new URL(jsApiUrl) as JsapiURL,
    processInfoId,
    workerName,
    workerUrl,
  };
}

/**
 * Determine if a given worker kind is a Community worker.
 * @returns True if the worker kind is a Community worker, false otherwise.
 */
export function isCommunityWorkerKind(workerKind?: WorkerKind): boolean {
  return workerKind?.protocols?.includes(PROTOCOL.COMMUNITY) ?? false;
}

/**
 * Polyfill some things needed by the DHE jsapi. The need for this should go
 * away once DH-17942 is completed and the jsapi no longer relies on `window`
 * or `self`.
 */
export function polyfillDhe(): void {
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
