import type { dh as DhType } from '@deephaven/jsapi-types';
import { NoConsoleTypesError } from './errorUtils';

export const AUTH_HANDLER_TYPE_ANONYMOUS =
  'io.deephaven.auth.AnonymousAuthenticationHandler';

export const AUTH_HANDLER_TYPE_PSK =
  'io.deephaven.authentication.psk.PskAuthenticationHandler';

export type ConnectionAndSession<TConnection, TSession> = {
  cn: TConnection;
  session: TSession;
};

/**
 * Get embed widget url for a widget.
 * @param serverUrl
 * @param title
 * @param themeKey
 * @param psk
 */
export function getEmbedWidgetUrl(
  serverUrl: URL,
  title: string,
  themeKey: string,
  psk?: string
): string {
  const serverUrlStr = serverUrl.toString().replace(/\/$/, '');
  return `${serverUrlStr}/iframe/widget/?theme=${themeKey}&name=${title}${psk ? `&psk=${psk}` : ''}`;
}

export async function initDhcSession(
  client: DhType.CoreClient,
  credentials: DhType.LoginCredentials
): Promise<ConnectionAndSession<DhType.IdeConnection, DhType.IdeSession>> {
  await client.login(credentials);

  const cn = await client.getAsIdeConnection();

  const [type] = await cn.getConsoleTypes();

  if (type == null) {
    throw new NoConsoleTypesError();
  }

  const session = await cn.startSession(type);

  return { cn, session };
}
