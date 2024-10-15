import * as vscode from 'vscode';
import type { SecretService, URLMap } from '../services';
import { ControllerBase } from './ControllerBase';
import type { LoginCredentials as DheLoginCredentials } from '@deephaven-enterprise/jsapi-types';
import {
  GENERATE_DHE_KEY_PAIR_CMD,
  REQUEST_DHE_USER_CREDENTIALS_CMD,
} from '../common';
import { generateKeyPairForUser, Logger } from '../util';
import type { ServerState } from '../types';

const logger = new Logger('UserLoginController');

/**
 * Controller for user login.
 */
export class UserLoginController extends ControllerBase {
  constructor(
    dheCredentialsCache: URLMap<DheLoginCredentials>,
    secretService: SecretService
  ) {
    super();
    this.dheCredentialsCache = dheCredentialsCache;
    this.secretService = secretService;

    this.registerCommand(
      GENERATE_DHE_KEY_PAIR_CMD,
      this.onDidRequestGenerateDheKeyPair
    );

    this.registerCommand(
      REQUEST_DHE_USER_CREDENTIALS_CMD,
      this.onDidRequestDheUserCredentials
    );
  }

  private readonly dheCredentialsCache: URLMap<DheLoginCredentials>;
  private readonly secretService: SecretService;

  /**
   * Handle request for generating a DHE key pair.
   * @param serverState The server state to generate the key pair for.
   */
  onDidRequestGenerateDheKeyPair = async (
    serverState: ServerState
  ): Promise<void> => {
    const serverUrl = serverState.url;
    await this.onDidRequestDheUserCredentials(serverUrl);

    const credentials = this.dheCredentialsCache.get(serverUrl);
    if (credentials?.username == null) {
      return;
    }

    const { publicKey, privateKey } = generateKeyPairForUser(
      credentials.username
    );

    // TODO: Challenge response send public key to server
    logger.debug('Public key:', publicKey);

    await this.secretService.storePrivateKey(
      credentials.username,
      serverUrl,
      privateKey
    );

    // Remove credentials from cache since presumably a valid key pair was
    // generated and we'll want the user to authenticate with the private key
    // instead.
    this.dheCredentialsCache.delete(serverUrl);
  };

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
