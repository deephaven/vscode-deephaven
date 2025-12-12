import {
  deletePublicKeys,
  generateBase64KeyPair,
  loginClientWithKeyPair,
  loginClientWithPassword,
  uploadPublicKey,
  type Base64KeyPair,
  type Username,
} from '@deephaven-enterprise/auth-nodejs';
import { type dh as DhcType } from '@deephaven/jsapi-types';
import { ControllerBase } from './ControllerBase';
import {
  CREATE_CORE_AUTHENTICATED_CLIENT_CMD,
  CREATE_DHE_AUTHENTICATED_CLIENT_CMD,
  GENERATE_DHE_KEY_PAIR_CMD,
} from '../common';
import {
  Logger,
  promptForPsk,
  promptForAuthFlow,
  promptForCredentials,
  isMultiAuthConfig,
  getAuthFlow,
  isNoAuthConfig,
  type URLMap,
} from '../util';
import type {
  CoreAuthenticatedClient,
  CoreUnauthenticatedClient,
  DheAuthenticatedClientWrapper,
  IAsyncCacheService,
  ICoreClientFactory,
  IDheClientFactory,
  ISecretService,
  IServerManager,
  IToastService,
  LoginPromptCredentials,
  ServerState,
} from '../types';
import {
  getDheAuthConfig,
  hasInteractivePermission,
  loginClientWrapper,
} from '../dh/dhe';
import {
  AUTH_HANDLER_TYPE_ANONYMOUS,
  AUTH_HANDLER_TYPE_DHE,
  AUTH_HANDLER_TYPE_PSK,
  loginClient,
} from '../dh/dhc';
import { SamlAuthProvider } from '../providers';

const logger = new Logger('UserLoginController');

/**
 * Controller for user login.
 */
export class UserLoginController extends ControllerBase {
  constructor(
    coreClientCache: URLMap<CoreAuthenticatedClient>,
    coreClientFactory: ICoreClientFactory,
    coreJsApiCache: IAsyncCacheService<URL, typeof DhcType>,
    dheClientCache: URLMap<DheAuthenticatedClientWrapper>,
    dheClientFactory: IDheClientFactory,
    secretService: ISecretService,
    serverManager: IServerManager,
    toastService: IToastService
  ) {
    super();

    this.coreClientCache = coreClientCache;
    this.coreClientFactory = coreClientFactory;
    this.coreJsApiCache = coreJsApiCache;
    this.dheClientCache = dheClientCache;
    this.dheClientFactory = dheClientFactory;
    this.secretService = secretService;
    this.serverManager = serverManager;
    this.toast = toastService;

    this.registerCommand(
      GENERATE_DHE_KEY_PAIR_CMD,
      this.onDidRequestGenerateDheKeyPair
    );

    this.registerCommand(
      CREATE_CORE_AUTHENTICATED_CLIENT_CMD,
      this.onCreateCoreAuthenticatedClient
    );

    this.registerCommand(
      CREATE_DHE_AUTHENTICATED_CLIENT_CMD,
      this.onCreateDHEAuthenticatedClient
    );
  }

  private readonly coreClientCache: URLMap<CoreAuthenticatedClient>;
  private readonly coreClientFactory: ICoreClientFactory;
  private readonly coreJsApiCache: IAsyncCacheService<URL, typeof DhcType>;
  private readonly dheClientCache: URLMap<DheAuthenticatedClientWrapper>;
  private readonly dheClientFactory: IDheClientFactory;
  private readonly secretService: ISecretService;
  private readonly serverManager: IServerManager;
  private readonly toast: IToastService;

  /**
   * Login with a given key pair and remove the public key from the server.
   * @param serverUrl The server URL to remove the key from.
   * @param userName The user name to remove the key for.
   * @param keyPair The key pair that contains the public key to be removed. The
   * key pair is needed since a login is required before the deletion.
   */
  private _deleteUserPublicKey = async (
    serverUrl: URL,
    userName: Username,
    keyPair: Base64KeyPair
  ): Promise<void> => {
    const dheClient = await loginClientWithKeyPair(
      (await this.dheClientFactory(serverUrl)).client,
      {
        type: 'keyPair',
        username: userName,
        keyPair,
      }
    );

    const { type, publicKey } = keyPair;

    try {
      await deletePublicKeys({
        dheClient,
        userName,
        publicKeys: [publicKey],
        type,
      });
    } finally {
      dheClient.disconnect();
    }
  };

  /**
   * Handle request for generating a DHE key pair.
   * @param serverState The server state to generate the key pair for.
   */
  onDidRequestGenerateDheKeyPair = async (
    serverState: ServerState | undefined
  ): Promise<void> => {
    // Sometimes view/item/context commands pass undefined instead of a value.
    // Just ignore.
    if (serverState == null) {
      logger.debug(
        'onDidRequestGenerateDheKeyPair',
        'serverState is undefined'
      );
      return;
    }

    const serverUrl = serverState.url;

    const title = 'Generate Private Key';

    const userLoginPreferences =
      await this.secretService.getUserLoginPreferences(serverUrl);

    const credentials = await promptForCredentials({
      title,
      userLoginPreferences,
    });

    // Cancelled by user
    if (credentials == null) {
      return;
    }

    const keyPair = generateBase64KeyPair();
    const { type, publicKey } = keyPair;

    const dheClient = await loginClientWithPassword(
      (await this.dheClientFactory(serverUrl)).client,
      credentials
    );

    await uploadPublicKey({
      dheClient,
      userName: credentials.username,
      comment: `Generated by VSCode ${new Date().toISOString()}`,
      publicKey,
      type,
    });

    const existingServerKeys =
      await this.secretService.getServerKeys(serverUrl);

    // Attempt to remove older keys / previously generated keys for other users
    // from the server. Ignore errors since this is an optimistic cleanup, and
    // it's possible the keys have already been removed.
    Object.entries(existingServerKeys).forEach(async ([username, keyPair]) => {
      try {
        await this._deleteUserPublicKey(
          serverUrl,
          username as Username,
          keyPair
        );
      } catch (err) {
        logger.error(err);
      }
    });

    // Store the new private key for the user
    await this.secretService.storeServerKeys(serverUrl, {
      [credentials.username]: keyPair,
    });

    this.toast.info(
      `Successfully generated a new key pair for ${credentials.username}.`
    );
  };

  /**
   * Create a core authenticated client.
   */
  onCreateCoreAuthenticatedClient = async (serverUrl: URL): Promise<void> => {
    let client: CoreUnauthenticatedClient | null = null;
    let credentials: DhcType.LoginCredentials | null = null;

    try {
      client = await this.coreClientFactory(serverUrl);

      const authConfig = new Set(
        (await client.getAuthConfigValues()).map(([, value]) => value)
      );

      if (authConfig.has(AUTH_HANDLER_TYPE_ANONYMOUS)) {
        const dh = await this.coreJsApiCache.get(serverUrl);
        credentials = {
          type: dh.CoreClient.LOGIN_TYPE_ANONYMOUS,
        };
      } else if (authConfig.has(AUTH_HANDLER_TYPE_PSK)) {
        const token =
          (await this.secretService.getPsk(serverUrl)) ??
          (await promptForPsk('Enter your Pre-Shared Key'));

        if (token == null) {
          this.toast.info('Login cancelled.');
          return;
        }

        credentials = {
          type: AUTH_HANDLER_TYPE_PSK,
          token,
        };

        this.secretService.storePsk(serverUrl, token);
      } else if (authConfig.has(AUTH_HANDLER_TYPE_DHE)) {
        credentials = await this.serverManager.getWorkerCredentials(serverUrl);
        if (credentials == null) {
          throw new Error(
            `Failed to get credentials for worker '${serverUrl}'`
          );
        }
      } else {
        throw new Error('No supported authentication methods found.');
      }
    } catch (err) {
      const msg = 'Failed to connect to Deephaven server.';
      logger.error(msg, err);
      this.toast.error(msg);

      return;
    }

    try {
      this.coreClientCache.set(
        serverUrl,
        await loginClient(client, credentials)
      );
    } catch (err) {
      const msg = 'Login failed.';
      logger.error(msg, err);
      this.toast.error(msg);

      this.coreClientCache.delete(serverUrl);

      if (credentials.type === AUTH_HANDLER_TYPE_PSK) {
        await this.secretService.deletePsk(serverUrl);
      }
    }
  };

  /**
   * Create a DHE authenticated client.
   * @param serverUrl The server URL to create a client for.
   * @param operateAsAnotherUser Whether to operate as another user.
   * @returns A promise that resolves when the client has been created or failed.
   */
  onCreateDHEAuthenticatedClient = async (
    serverUrl: URL,
    operateAsAnotherUser: boolean
  ): Promise<void> => {
    const dheClient = await this.dheClientFactory(serverUrl);
    const authConfig = await getDheAuthConfig(dheClient.client);

    if (isNoAuthConfig(authConfig)) {
      this.toast.info('No authentication methods configured.');
      return;
    }

    const authFlow = isMultiAuthConfig(authConfig)
      ? await promptForAuthFlow(authConfig)
      : getAuthFlow(authConfig);

    if (authFlow == null) {
      this.toast.info('Login cancelled.');
      return;
    }

    let authenticatedClient: DheAuthenticatedClientWrapper;
    let credentials: LoginPromptCredentials | undefined = undefined;

    try {
      if (authFlow.type === 'saml') {
        authenticatedClient = await SamlAuthProvider.runSamlLoginWorkflow(
          dheClient,
          serverUrl,
          authFlow.config
        );
      } else {
        const title = 'Login';

        const secretKeys = await this.secretService.getServerKeys(serverUrl);
        const userLoginPreferences =
          await this.secretService.getUserLoginPreferences(serverUrl);

        const privateKeyUserNames = Object.keys(secretKeys) as Username[];

        credentials = await promptForCredentials({
          title,
          userLoginPreferences,
          privateKeyUserNames,
          showOperateAs: operateAsAnotherUser,
        });

        // Cancelled by user
        if (credentials == null) {
          this.toast.info('Login cancelled.');
          return;
        }

        const { username, operateAs = username } = credentials;

        await this.secretService.storeUserLoginPreferences(serverUrl, {
          lastLogin: username,
          operateAsUser: {
            ...userLoginPreferences.operateAsUser,
            [username]: operateAs,
          },
        });

        authenticatedClient =
          credentials.type === 'password'
            ? await loginClientWrapper(
                dheClient,
                loginClientWithPassword,
                credentials
              )
            : await loginClientWrapper(dheClient, loginClientWithKeyPair, {
                ...credentials,
                keyPair: (await this.secretService.getServerKeys(serverUrl))?.[
                  username
                ],
              });
      }

      if (!(await hasInteractivePermission(authenticatedClient.client))) {
        throw new Error('User does not have interactive permissions.');
      }

      this.dheClientCache.set(serverUrl, authenticatedClient);
    } catch (err) {
      logger.error('An error occurred while connecting to DHE server:', err);
      this.dheClientCache.delete(serverUrl);

      this.toast.error('Login failed. Please check your credentials.');

      if (credentials?.type === 'keyPair') {
        await this.secretService.deleteUserServerKeys(
          serverUrl,
          credentials.username
        );
      }
    }
  };
}
