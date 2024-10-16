import type { SecretService, URLMap } from '../services';
import { ControllerBase } from './ControllerBase';
import type { LoginCredentials as DheLoginCredentials } from '@deephaven-enterprise/jsapi-types';
import {
  GENERATE_DHE_KEY_PAIR_CMD,
  REQUEST_DHE_USER_CREDENTIALS_CMD,
} from '../common';
import {
  createAuthenticationMethodQuickPick,
  formatDHPublicKey,
  generateBase64KeyPair,
  Logger,
  promptForOperateAs,
  promptForPassword,
  promptForUsername,
} from '../util';
import type { Lazy, LoginWorkflowType, ServerState, Username } from '../types';

const logger = new Logger('UserLoginController');

/**
 * Controller for user login.
 */
export class UserLoginController extends ControllerBase {
  constructor(
    dheCredentialsCache: URLMap<Lazy<DheLoginCredentials>>,
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

  private readonly dheCredentialsCache: URLMap<Lazy<DheLoginCredentials>>;
  private readonly secretService: SecretService;

  /**
   * Handle request for generating a DHE key pair.
   * @param serverState The server state to generate the key pair for.
   */
  onDidRequestGenerateDheKeyPair = async (
    serverState: ServerState
  ): Promise<void> => {
    const serverUrl = serverState.url;
    await this.onDidRequestDheUserCredentials(serverUrl, 'generatePrivateKey');

    const credentials = await this.dheCredentialsCache.get(serverUrl)?.();
    if (credentials?.username == null) {
      return;
    }

    const [publicKey, privateKey] = generateBase64KeyPair();

    // TODO: Challenge response send public key to server
    logger.debug(
      'Public key:',
      formatDHPublicKey(credentials.username, publicKey)
    );

    // Get existing server keys or create a new object
    const serverKeys = await this.secretService.getServerKeys(serverUrl);

    // Store the new private key for the user
    await this.secretService.storeServerKeys(serverUrl, {
      ...serverKeys,
      [credentials.username]: privateKey,
    });

    // Remove credentials from cache since presumably a valid key pair was
    // generated and we'll want the user to authenticate with the private key
    // instead.
    this.dheCredentialsCache.delete(serverUrl);
  };

  /**
   * Handle the request for DHE user credentials. If credentials are provided,
   * they will be stored in the credentials cache.
   * @param serverUrl The server URL to request credentials for.
   * @param isGeneratePrivateKeyWorkflow Whether the request is part of a private key generation workflow.
   * @returns A promise that resolves when the credentials have been provided or declined.
   */
  onDidRequestDheUserCredentials = async (
    serverUrl: URL,
    workflowType: LoginWorkflowType = 'login'
  ): Promise<void> => {
    // Remove any existing credentials for the server
    this.dheCredentialsCache.delete(serverUrl);

    const title =
      workflowType === 'generatePrivateKey' ? 'Generate Private Key' : 'Login';

    const secretKeys = await this.secretService.getServerKeys(serverUrl);
    const userLoginPreferences =
      await this.secretService.getUserLoginPreferences(serverUrl);

    const privateKeyUserNames = Object.keys(secretKeys) as Username[];

    if (workflowType === 'login' && privateKeyUserNames.length > 0) {
      const authenticationMethod = await createAuthenticationMethodQuickPick(
        title,
        privateKeyUserNames
      );

      if (authenticationMethod?.type === 'privateKey') {
        const username = authenticationMethod.label;

        // Operate As
        const operateAs = await promptForOperateAs(
          title,
          userLoginPreferences.operateAsUser[username] ?? username
        );
        if (operateAs == null) {
          return;
        }

        await this.secretService.storeUserLoginPreferences(serverUrl, {
          lastLogin: username,
          operateAsUser: {
            ...userLoginPreferences.operateAsUser,
            [username]: operateAs,
          },
        });

        this.dheCredentialsCache.set(serverUrl, async () => {
          logger.debug('Login with private key:', authenticationMethod.label);
          // TODO: login with private key
          throw new Error('Login with private key not implemented');
        });

        return;
      }
    }

    // Username
    const username = await promptForUsername(
      title,
      userLoginPreferences.lastLogin
    );
    if (username == null) {
      return;
    }

    // Password
    const token = await promptForPassword(title);
    if (token == null) {
      return;
    }

    // Operate As
    const operateAs = await promptForOperateAs(
      title,
      userLoginPreferences.operateAsUser[username] ?? username
    );
    if (operateAs == null) {
      return;
    }

    await this.secretService.storeUserLoginPreferences(serverUrl, {
      lastLogin: username,
      operateAsUser: {
        ...userLoginPreferences.operateAsUser,
        [username]: operateAs,
      },
    });

    const dheCredentials: DheLoginCredentials = {
      username,
      token,
      type: 'password',
    };

    this.dheCredentialsCache.set(serverUrl, async () => dheCredentials);
  };
}
