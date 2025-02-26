import * as vscode from 'vscode';
import {
  type AuthenticatedClient as DheAuthenticatedClient,
  type UnauthenticatedClient,
} from '@deephaven-enterprise/auth-nodejs';
import { Logger, makeSAMLSessionKey, parseSamlScopes, uniqueId } from '../util';
import {
  DH_SAML_AUTH_PROVIDER_TYPE,
  DH_SAML_LOGIN_URL_SCOPE_KEY,
  DH_SAML_SERVER_URL_SCOPE_KEY,
} from '../common';
import { UriEventHandler, URLMap } from '../services';
import { type Disposable, type SamlConfig, type UniqueID } from '../types';

const logger = new Logger('SamlAuthProvider');

export class SamlAuthProvider
  implements vscode.AuthenticationProvider, vscode.Disposable
{
  /**
   * Pending auth state is created before initiating the SAML login flow and
   * used to verify the redirect response and to finalize the login once redirects
   * have completed.
   */
  private static pendingAuthState = new URLMap<{
    client: UnauthenticatedClient & Disposable;
    stateId: UniqueID;
  }>();

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
    SamlAuthProvider.pendingAuthState.set(serverUrl, {
      client: dheClient,
      stateId: uniqueId(),
    });

    try {
      await vscode.authentication.getSession(
        DH_SAML_AUTH_PROVIDER_TYPE,
        [
          `${DH_SAML_SERVER_URL_SCOPE_KEY}:${serverUrl.href}`,
          `${DH_SAML_LOGIN_URL_SCOPE_KEY}:${config.loginUrl}`,
        ],
        { createIfNone: true }
      );
    } finally {
      SamlAuthProvider.pendingAuthState.delete(serverUrl);
    }

    return dheClient as unknown as DheAuthenticatedClient;
  };

  constructor(context: vscode.ExtensionContext) {
    this._context = context;

    this._disposable = vscode.Disposable.from(
      this._onDidChangeSessions,
      vscode.authentication.registerAuthenticationProvider(
        DH_SAML_AUTH_PROVIDER_TYPE,
        'Deephaven SAML',
        this,
        { supportsMultipleAccounts: false }
      ),
      vscode.window.registerUriHandler(this._uriEventHandler),
      SamlAuthProvider.pendingAuthState
    );
  }

  private readonly _onDidChangeSessions =
    new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();

  readonly onDidChangeSessions: vscode.Event<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent> =
    this._onDidChangeSessions.event;

  private readonly _context: vscode.ExtensionContext;
  private readonly _disposable: vscode.Disposable;
  private readonly _uriEventHandler = new UriEventHandler();

  createSamlRedirectUrl(stateId: UniqueID): URL {
    const publisher = this._context.extension.packageJSON.publisher;
    const name = this._context.extension.packageJSON.name;
    return new URL(`${vscode.env.uriScheme}://${publisher}.${name}/${stateId}`);
  }

  dispose = (): void => {
    this._disposable.dispose();
  };

  /**
   * Get a list of sessions.
   * @param scopes An optional list of scopes. If provided, the sessions returned
   * these scopes, otherwise all sessions should be returned.
   * @returns A promise that resolves to an array of authentication sessions.
   */
  getSessions = async (
    _scopes?: readonly string[]
  ): Promise<readonly vscode.AuthenticationSession[]> => {
    return [];
  };

  /**
   * Prompts a user to login.
   *
   * If login is successful, the onDidChangeSessions event should be fired.
   *
   * If login fails, a rejected promise should be returned.
   *
   * If the provider has specified that it does not support multiple accounts,
   * then this should never be called if there is already an existing session
   * matching these scopes.
   * @param scopes A list of scopes that the new session should be created with.
   * @returns A promise that resolves to an authentication session.
   */
  createSession = async (
    scopes: readonly string[]
  ): Promise<vscode.AuthenticationSession> => {
    const samlScopes = parseSamlScopes(scopes);
    if (samlScopes == null) {
      throw new Error(
        'SAML authentication provider does not support this scope.'
      );
    }

    logger.debug('createSession', samlScopes);

    const samlSessionKey = makeSAMLSessionKey();
    logger.debug('samlSessionKey:', `${samlSessionKey}`);

    const serverUrl = new URL(samlScopes.serverUrl);
    const { stateId } = SamlAuthProvider.pendingAuthState.getOrThrow(serverUrl);

    const samlLoginUrl = new URL(samlScopes.samlLoginUrl);
    samlLoginUrl.searchParams.append('key', samlSessionKey);
    samlLoginUrl.searchParams.append(
      'redirect',
      `${this.createSamlRedirectUrl(stateId)}`
    );

    const authSucceeded = await vscode.window.withProgress<boolean>(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Signing in to Deephaven...',
        cancellable: true,
      },
      async (_, cancellationToken) => {
        await vscode.env.openExternal(
          vscode.Uri.parse(samlLoginUrl.toString())
        );

        const subscriptions: vscode.Disposable[] = [];

        return Promise.race([
          new Promise<true>((resolve, reject) => {
            this._uriEventHandler.event(
              async uri => {
                logger.debug('Handling uri:', uri.toString());

                const state = SamlAuthProvider.pendingAuthState.get(serverUrl);
                if (state == null) {
                  reject(`No state found for ${uri}.`);
                  return;
                }

                const stateId = uri.path.substring(1);
                if (stateId !== state.stateId) {
                  reject(`State id mismatch: ${stateId}`);
                  return;
                }

                resolve(true);
              },
              undefined,
              subscriptions
            );
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject('Cancelled by timeout.'), 60000)
          ),
          new Promise<never>((_, reject) =>
            cancellationToken.onCancellationRequested(
              () => reject('Cancelled by user.'),
              undefined,
              subscriptions
            )
          ),
        ]).finally(() => {
          subscriptions.forEach(subscription => subscription.dispose());
          subscriptions.length = 0;
        });
      }
    );

    if (!authSucceeded) {
      throw new Error('Deephaven SAML authentication failed.');
    }

    const { client: dheClient } =
      SamlAuthProvider.pendingAuthState.getOrThrow(serverUrl);

    try {
      await dheClient.login({
        type: 'saml',
        token: samlSessionKey,
      });
    } catch (err) {
      logger.error('Error during SAML login:', err);
      throw err;
    }

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
