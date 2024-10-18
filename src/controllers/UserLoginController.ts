import * as vscode from 'vscode';
import type { URLMap } from '../services';
import { ControllerBase } from './ControllerBase';
import type { LoginCredentials as DheLoginCredentials } from '@deephaven-enterprise/jsapi-types';
import { REQUEST_DHE_USER_CREDENTIALS_CMD } from '../common';

/**
 * Controller for user login.
 */
export class UserLoginController extends ControllerBase {
  constructor(dheCredentialsCache: URLMap<DheLoginCredentials>) {
    super();
    this.dheCredentialsCache = dheCredentialsCache;

    this.registerCommand(
      REQUEST_DHE_USER_CREDENTIALS_CMD,
      this.onDidRequestDheUserCredentials
    );
  }

  private readonly dheCredentialsCache: URLMap<DheLoginCredentials>;

  /**
   * Handle the request for DHE user credentials. If credentials are provided,
   * they will be stored in the credentials cache.
   * @param serverUrl The server URL to request credentials for.
   * @returns A promise that resolves when the credentials have been provided or declined.
   */
  onDidRequestDheUserCredentials = async (serverUrl: URL): Promise<void> => {
    // Remove any existing credentials for the server
    this.dheCredentialsCache.delete(serverUrl);

    const username = await vscode.window.showInputBox({
      placeHolder: 'Username',
      prompt: 'Enter your Deephaven username',
    });

    if (username == null) {
      return;
    }

    const token = await vscode.window.showInputBox({
      placeHolder: 'Password',
      prompt: 'Enter your Deephaven password',
      password: true,
    });

    if (token == null) {
      return;
    }

    const dheCredentials: DheLoginCredentials = {
      username,
      token,
      type: 'password',
    };

    this.dheCredentialsCache.set(serverUrl, dheCredentials);
  };
}
