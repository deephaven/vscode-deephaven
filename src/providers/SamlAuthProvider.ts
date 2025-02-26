import * as vscode from 'vscode';
import {
  type AuthenticatedClient as DheAuthenticatedClient,
  type UnauthenticatedClient,
} from '@deephaven-enterprise/auth-nodejs';
import { assertDefined, makeSAMLSessionKey, uniqueId } from '../util';
import { DH_SAML_AUTH_PROVIDER_TYPE } from '../common';
import { UriEventHandler, URLMap } from '../services';
import { type Disposable, type SamlConfig } from '../types';

export class SamlAuthProvider
  implements vscode.AuthenticationProvider, vscode.Disposable
{
  /**
   * Static map of unauthenticated DHE clients. This is needed because
   * `vscode.authentication.getSession` doesn't expose a way to pass in data,
   * so this is an easy way to store the client and retrieve it during the auth
   * flow initiated by `runSamlLoginWorkflow`.
   */
  private static dheClientsPendingAuth = new URLMap<
    UnauthenticatedClient & Disposable
  >();

  /**
   * Run the SAML login workflow.
   * @param dheClient The unauthenticated DHE client.
   * @param serverUrl The server URL.
   * @param config The SAML config.
   * @returns The authenticated DHE client.
   */
  static runSamlLoginWorkflow = async (
    dheClient: UnauthenticatedClient & Disposable,
    serverUrl: URL,
    config: SamlConfig
  ): Promise<DheAuthenticatedClient> => {
    const samlLoginUrlRaw = config.loginUrl;
    SamlAuthProvider.dheClientsPendingAuth.set(serverUrl, dheClient);

    try {
      await vscode.authentication.getSession(
        DH_SAML_AUTH_PROVIDER_TYPE,
        [serverUrl.href, samlLoginUrlRaw],
        { createIfNone: true }
      );
    } finally {
      SamlAuthProvider.dheClientsPendingAuth.delete(serverUrl);
    }

    return dheClient as unknown as DheAuthenticatedClient;
  };

  constructor(
    context: vscode.ExtensionContext,
    dheClientCache: URLMap<DheAuthenticatedClient>
  ) {
    this._context = context;
    this._dheClientCache = dheClientCache;

    this._disposable = vscode.Disposable.from(
      this._onDidChangeSessions,
      vscode.authentication.registerAuthenticationProvider(
        DH_SAML_AUTH_PROVIDER_TYPE,
        'Deephaven SAML',
        this,
        { supportsMultipleAccounts: false }
      ),
      vscode.window.registerUriHandler(this._uriEventHandler),
      SamlAuthProvider.dheClientsPendingAuth
    );
  }

  private readonly _onDidChangeSessions =
    new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();

  readonly onDidChangeSessions: vscode.Event<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent> =
    this._onDidChangeSessions.event;

  private readonly _context: vscode.ExtensionContext;
  private readonly _dheClientCache: URLMap<DheAuthenticatedClient>;
  private readonly _disposable: vscode.Disposable;
  private readonly _uriEventHandler = new UriEventHandler();

  get samlRedirectUrl(): URL {
    const publisher = this._context.extension.packageJSON.publisher;
    const name = this._context.extension.packageJSON.name;
    return new URL(`${vscode.env.uriScheme}://${publisher}.${name}/`);
  }

  dispose = (): void => {
    this._disposable.dispose();
  };

  getSessions = async (
    _scopes?: readonly string[]
  ): Promise<readonly vscode.AuthenticationSession[]> => {
    return [];
  };

  createSession = async (
    scopes: readonly string[]
  ): Promise<vscode.AuthenticationSession> => {
    console.log('[TESTING] createSession', scopes);
    const [serverUrlRaw, samlLoginUrlRaw] = scopes;
    const samlSessionKey = makeSAMLSessionKey();
    console.log('[TESTING] samlSessionKey:', samlSessionKey);

    const redirectUrl = this.samlRedirectUrl;

    const samlLoginUrl = new URL(samlLoginUrlRaw);
    samlLoginUrl.searchParams.append('key', samlSessionKey);
    samlLoginUrl.searchParams.append('redirect', `${redirectUrl}`);

    const authSucceeded = await vscode.window.withProgress<boolean>(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Signing in to Deephaven...',
        cancellable: true,
      },
      async (_, token) => {
        await vscode.env.openExternal(
          vscode.Uri.parse(samlLoginUrl.toString())
        );

        return Promise.race([
          new Promise<true>(resolve => {
            this._uriEventHandler.event(async uri => {
              console.log('[TESTING] handling uri:', uri.toString());
              resolve(true);
            });
          }),
          new Promise<false>((_, reject) =>
            setTimeout(() => reject('Cancelled'), 60000)
          ),
          new Promise<false>((_, reject) =>
            token.onCancellationRequested(() => reject('Cancelled'))
          ),
        ]);
      }
    );

    if (!authSucceeded) {
      throw new Error('Deephaven SAML authentication failed.');
    }

    const serverUrl = new URL(serverUrlRaw);

    const dheClient = SamlAuthProvider.dheClientsPendingAuth.get(serverUrl);

    assertDefined(dheClient, 'DHE client not found in pending auth map');

    try {
      await dheClient.login({
        type: 'saml',
        token: samlSessionKey,
      });
    } catch (err) {
      console.error('Error during SAML login:', err);
      throw err;
    }

    this._dheClientCache.set(
      serverUrl,
      dheClient as unknown as DheAuthenticatedClient
    );

    const userInfo = await dheClient.getUserInfo();

    const session: vscode.AuthenticationSession = {
      id: uniqueId(),
      accessToken: samlSessionKey,
      account: {
        id: userInfo.username,
        label: userInfo.username,
      },
      scopes,
    };

    return session;
  };

  removeSession = async (_sessionId: string): Promise<void> => {
    throw new Error('Method not implemented.');
  };
}
