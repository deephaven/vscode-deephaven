import * as vscode from 'vscode';
import type { SecretService, URLMap } from '../services';
import { ControllerBase } from './ControllerBase';
import type { EnterpriseClient } from '@deephaven-enterprise/jsapi-types';
import {
  DISPOSE_DHE_CLIENT_CMD,
  GENERATE_DHE_KEY_PAIR_CMD,
  REQUEST_DHE_USER_CREDENTIALS_CMD,
} from '../common';
import {
  authWithPrivateKey,
  generateBase64KeyPair,
  isNonEmptyArray,
  Logger,
  runUserLoginWorkflow,
  uploadPublicKey,
} from '../util';
import type {
  IAsyncCacheService,
  IToastService,
  PasswordOrPrivateKeyCredentials,
  ServerState,
  Username,
} from '../types';

const logger = new Logger('UserLoginController');

/**
 * Controller for user login.
 */
export class UserLoginController extends ControllerBase {
  constructor(
    dheClientCache: IAsyncCacheService<URL, EnterpriseClient>,
    dheCredentialsCache: URLMap<PasswordOrPrivateKeyCredentials>,
    secretService: SecretService,
    toastService: IToastService
  ) {
    super();

    this.dheClientCache = dheClientCache;
    this.dheCredentialsCache = dheCredentialsCache;
    this.secretService = secretService;
    this.toast = toastService;

    this.registerCommand(
      GENERATE_DHE_KEY_PAIR_CMD,
      this.onDidRequestGenerateDheKeyPair
    );

    this.registerCommand(
      REQUEST_DHE_USER_CREDENTIALS_CMD,
      this.onDidRequestDheUserCredentials
    );
  }

  private readonly dheClientCache: IAsyncCacheService<URL, EnterpriseClient>;
  private readonly dheCredentialsCache: URLMap<PasswordOrPrivateKeyCredentials>;
  private readonly secretService: SecretService;
  private readonly toast: IToastService;

  /**
   * Handle request for generating a DHE key pair.
   * @param serverState The server state to generate the key pair for.
   */
  onDidRequestGenerateDheKeyPair = async (
    serverState: ServerState
  ): Promise<void> => {
    const serverUrl = serverState.url;

    const title = 'Generate Private Key';

    const credentials = await runUserLoginWorkflow({
      title,
      showOperatesAs: true,
    });

    // Cancelled by user
    if (credentials == null) {
      return;
    }

    const keyPair = generateBase64KeyPair();
    const { type, publicKey } = keyPair;

    const dheClient = await this.dheClientCache.get(serverUrl);

    await uploadPublicKey(dheClient, credentials, publicKey, type);

    // Get existing server keys or create a new object
    const serverKeys = await this.secretService.getServerKeys(serverUrl);

    // Store the new private key for the user
    await this.secretService.storeServerKeys(serverUrl, {
      ...serverKeys,
      [credentials.username]: keyPair,
    });

    this.toast.info(
      `Successfully generated a new key pair for ${credentials.username}.`
    );
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

    const title = 'Login';

    const secretKeys = await this.secretService.getServerKeys(serverUrl);
    const userLoginPreferences =
      await this.secretService.getUserLoginPreferences(serverUrl);

    const privateKeyUserNames = Object.keys(secretKeys) as Username[];

    if (isNonEmptyArray(privateKeyUserNames)) {
      const credentials = await runUserLoginWorkflow({
        title,
        userLoginPreferences,
        privateKeyUserNames,
        showOperatesAs: true,
      });

      // Cancelled by user
      if (credentials == null) {
        return;
      }

      const { username, operateAs } = credentials;

      await this.secretService.storeUserLoginPreferences(serverUrl, {
        lastLogin: username,
        operateAsUser: {
          ...userLoginPreferences.operateAsUser,
          [username]: operateAs,
        },
      });

      logger.debug('Login with private key:', username);

      // Have to use a new client to login with the private key
      await vscode.commands.executeCommand(DISPOSE_DHE_CLIENT_CMD, serverUrl);

      const dheClient = await this.dheClientCache.get(serverUrl);

      const keyPair = (await this.secretService.getServerKeys(serverUrl))?.[
        username
      ];

      await authWithPrivateKey({
        dheClient,
        keyPair,
        username,
        operateAs: username,
      });

      this.dheCredentialsCache.set(serverUrl, credentials);

      return;
    }

    const dheCredentials = await runUserLoginWorkflow({
      title,
      userLoginPreferences,
      showOperatesAs: true,
    });

    if (dheCredentials == null) {
      return;
    }

    await this.secretService.storeUserLoginPreferences(serverUrl, {
      lastLogin: dheCredentials.username,
      operateAsUser: {
        ...userLoginPreferences.operateAsUser,
        [dheCredentials.username]: dheCredentials.operateAs,
      },
    });

    this.dheCredentialsCache.set(serverUrl, dheCredentials);
  };
}
