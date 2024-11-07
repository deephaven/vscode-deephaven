import type { dh as DhType } from '@deephaven/jsapi-types';
import { NoConsoleTypesError } from './errorUtils';
import type {
  CoreAuthenticatedClient,
  CoreUnauthenticatedClient,
} from '../types';

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
