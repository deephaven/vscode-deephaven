import type { dh as DhType } from '@deephaven/jsapi-types';
import { NoConsoleTypesError } from './errorUtils';
import type {
  CoreAuthenticatedClient,
  CoreUnauthenticatedClient,
  DependencyName,
  DependencyVersion,
} from '../types';
import { hasStatusCode, loadModules } from '@deephaven/jsapi-nodejs';
import {
  REQUIREMENTS_QUERY_TXT,
  REQUIREMENTS_TABLE_NAME,
  REQUIREMENTS_TABLE_NAME_COLUMN_NAME,
  REQUIREMENTS_TABLE_VERSION_COLUMN_NAME,
} from '../common';

export const AUTH_HANDLER_TYPE_ANONYMOUS =
  'io.deephaven.auth.AnonymousAuthenticationHandler';

export const AUTH_HANDLER_TYPE_PSK =
  'io.deephaven.authentication.psk.PskAuthenticationHandler';

export const AUTH_HANDLER_TYPE_DHE =
  'io.deephaven.enterprise.dnd.authentication.DheAuthenticationHandler';

export type ConnectionAndSession<TConnection, TSession> = {
  cn: TConnection;
  session: TSession;
};

/**
 * Download the DH Core jsapi from a running server and return the `dh` object.
 * @param serverUrl URL of the DH Core server to download the api from.
 * @param storageDir Directory to store downloaded jsapi files.
 * @returns A promise that resolves to the DH Core jsapi.
 */
export async function getDhc(
  serverUrl: URL,
  storageDir: string
): Promise<typeof DhType> {
  // Download jsapi `ESM` files from DH Community server.
  const coreModule = await loadModules<{ default: typeof DhType }>({
    serverUrl,
    serverPaths: ['jsapi/dh-core.js', 'jsapi/dh-internal.js'],
    download: true,
    storageDir,
    sourceModuleType: 'esm',
    targetModuleType: 'cjs',
    esbuildOptions: {
      tsconfigRaw: {
        compilerOptions: {
          // This needs to be set to avoid adding `use strict` to the output
          // which hits a protobuf bug. https://github.com/protocolbuffers/protobuf-javascript/issues/8
          strict: false,
        },
      },
    },
  });

  return coreModule.default;
}

/**
 * Get embed widget url for a widget.
 * @param serverUrl Server URL
 * @param title Widget title
 * @param themeKey Theme key
 * @param authProvider Optional auth provider
 * @param psk Optional psk
 */
export function getEmbedWidgetUrl({
  serverUrl,
  title,
  themeKey,
  authProvider,
  psk,
}: {
  serverUrl: URL;
  title: string;
  themeKey: string;
  authProvider?: 'parent';
  psk?: string | null;
}): URL {
  const url = new URL('/iframe/widget', serverUrl);

  url.searchParams.set('name', title);
  url.searchParams.set('theme', themeKey);

  if (authProvider) {
    url.searchParams.set('authProvider', authProvider);
  }

  if (psk) {
    url.searchParams.set('psk', psk);
  }

  return url;
}

/**
 * Get a name / version map of python dependencies from a DH session.
 * @param session
 * @returns A promise that resolves to a map of python dependencies.
 */
export async function getPythonDependencies(
  session: DhType.IdeSession
): Promise<Map<DependencyName, DependencyVersion>> {
  await session.runCode(REQUIREMENTS_QUERY_TXT);

  const dependencies = new Map<DependencyName, DependencyVersion>();

  const table = await session.getTable(REQUIREMENTS_TABLE_NAME);
  table.setViewport(0, table.size - 1);
  const data = await table.getViewportData();

  const nameColumn = table.findColumn(REQUIREMENTS_TABLE_NAME_COLUMN_NAME);
  const versionColumn = table.findColumn(
    REQUIREMENTS_TABLE_VERSION_COLUMN_NAME
  );

  for (const row of data.rows) {
    const name: DependencyName = row.get(nameColumn);
    const version: DependencyVersion = row.get(versionColumn);
    dependencies.set(name, version);
  }

  await session.runCode(`del ${REQUIREMENTS_TABLE_NAME}`);

  return dependencies;
}

/**
 * Initialize a connection and session to a DHC server.
 * @param client The authenticated client to use for the connection.
 * @returns A promise that resolves to the connection and session.
 */
export async function initDhcSession(
  client: CoreAuthenticatedClient
): Promise<ConnectionAndSession<DhType.IdeConnection, DhType.IdeSession>> {
  const cn = await client.getAsIdeConnection();

  const [type] = await cn.getConsoleTypes();

  if (type == null) {
    throw new NoConsoleTypesError();
  }

  const session = await cn.startSession(type);

  return { cn, session };
}

/**
 * Check if a given server is running by checking if the `dh-core.js` file is
 * accessible.
 * @param serverUrl
 */
export async function isDhcServerRunning(serverUrl: URL): Promise<boolean> {
  try {
    return await hasStatusCode(
      new URL('jsapi/dh-core.js', serverUrl.toString()),
      [200, 204]
    );
  } catch {
    return false;
  }
}

/**
 * Login a given unauthenticated client with the given credentials.
 * @param client The client to login.
 * @param credentials The credentials to use for the login.
 * @returns The authenticated client.
 */
export async function loginClient(
  client: CoreUnauthenticatedClient,
  credentials: DhType.LoginCredentials
): Promise<CoreAuthenticatedClient> {
  await client.login(credentials);
  return client as unknown as CoreAuthenticatedClient;
}
