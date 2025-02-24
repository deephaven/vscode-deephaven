import * as vscode from 'vscode';
import { makeSAMLSessionKey } from '../util';
import { DH_SAML_AUTH_PROVIDER_TYPE } from '../common';
import type { URLMap } from '../services';
import { type AuthenticatedClient as DheAuthenticatedClient } from '@deephaven-enterprise/auth-nodejs';

class UriEventHandler
  extends vscode.EventEmitter<vscode.Uri>
  implements vscode.UriHandler
{
  public handleUri(uri: vscode.Uri): void {
    this.fire(uri);
  }
}

export class SamlAuthProvider
  implements vscode.AuthenticationProvider, vscode.Disposable
{
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
      vscode.window.registerUriHandler(this._uriEventHandler)
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
    const samlLoginUrlRaw = scopes[0];
    const samlSessionKey = makeSAMLSessionKey();

    const redirectUrl = this.samlRedirectUrl;
    redirectUrl.searchParams.append('isSamlRedirect', 'true');

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
        console.log('[TESTING] samlLoginUrl:', samlLoginUrlRaw);

        await vscode.env.openExternal(
          vscode.Uri.parse(samlLoginUrl.toString())
        );

        return Promise.race([
          new Promise<true>(resolve => {
            this._uriEventHandler.event(async uri => {
              console.log('[TESTING] uri:', uri);
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

    const session: vscode.AuthenticationSession = {
      id: samlSessionKey,
      accessToken: '',
      account: {
        id: '',
        label: 'Deephaven SAML',
      },
      scopes,
    };

    return session;
  };

  removeSession = async (_sessionId: string): Promise<void> => {
    throw new Error('Method not implemented.');
  };
}
