import type { dh as DhType } from '@deephaven/jsapi-types';
import { NoConsoleTypesError } from './errorUtils';
import type { ConnectionState } from '../types';

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

export async function initDhcSession(
  client: DhType.CoreClient,
  credentials: DhType.LoginCredentials
): Promise<ConnectionAndSession<DhType.IdeConnection, DhType.IdeSession>> {
  try {
    await client.login(credentials);
  } catch (err) {
    console.error(err);
    throw err;
  }

  const cn = await client.getAsIdeConnection();

  const [type] = await cn.getConsoleTypes();

  if (type == null) {
    throw new NoConsoleTypesError();
  }

  const session = await cn.startSession(type);

  return { cn, session };
}
