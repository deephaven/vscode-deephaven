import type { SecretService, URLMap } from '../services';
import { ControllerBase } from './ControllerBase';
import type {
  LoginCredentials as DheLoginCredentials,
  EnterpriseClient,
} from '@deephaven-enterprise/jsapi-types';
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
  runUserLoginWorkflow,
} from '../util';
import type { IAsyncCacheService, Lazy, ServerState, Username } from '../types';

const logger = new Logger('UserLoginController');

/**
 * Controller for user login.
 */
export class UserLoginController extends ControllerBase {
  constructor(
    dheClientCache: IAsyncCacheService<URL, EnterpriseClient>,
    dheCredentialsCache: URLMap<Lazy<DheLoginCredentials>>,
    secretService: SecretService
  ) {
    super();

    this.dheClientCache = dheClientCache;
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

  private readonly dheClientCache: IAsyncCacheService<URL, EnterpriseClient>;
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
    // await this.onDidRequestDheUserCredentials(serverUrl, 'generatePrivateKey');

    // const credentials = await this.dheCredentialsCache.get(serverUrl)?.();
    // if (credentials?.username == null) {
    //   return;
    // }

    const title = 'Generate Private Key';

    // Username
    const username = await promptForUsername(title);
    if (username == null) {
      return;
    }

    // Password
    const token = await promptForPassword(title);
    if (token == null) {
      return;
    }

    const dheCredentials = {
      username,
      token,
      type: 'password',
    } as const satisfies DheLoginCredentials;

    const [publicKey, privateKey] = generateBase64KeyPair();

    const dheClient = await this.dheClientCache.get(serverUrl);
    await dheClient.login(dheCredentials);
    const { dbAclWriterHost, dbAclWriterPort } =
      await dheClient.getServerConfigValues();

    console.log('ACL Server:', `https://${dbAclWriterHost}:${dbAclWriterPort}`);

    // TODO: Challenge response send public key to server
    logger.debug(
      'Public key:',
      formatDHPublicKey(dheCredentials.username, publicKey)
    );

    // Get existing server keys or create a new object
    const serverKeys = await this.secretService.getServerKeys(serverUrl);

    // Store the new private key for the user
    await this.secretService.storeServerKeys(serverUrl, {
      ...serverKeys,
      [dheCredentials.username]: privateKey,
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

    if (privateKeyUserNames.length > 0) {
      const authenticationMethod = await createAuthenticationMethodQuickPick(
        title,
        privateKeyUserNames
      );

      if (authenticationMethod == null) {
        return;
      }

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

    const dheCredentials = await runUserLoginWorkflow(
      title,
      userLoginPreferences,
      true
    );

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

    this.dheCredentialsCache.set(serverUrl, async () => dheCredentials);
  };
}
