import type { URLMap } from '../services';
import { ControllerBase } from './ControllerBase';
import {
  CREATE_AUTHENTICATED_CLIENT_CMD,
  GENERATE_DHE_KEY_PAIR_CMD,
} from '../common';
import {
  authWithPrivateKey,
  generateBase64KeyPair,
  Logger,
  loginClient,
  runUserLoginWorkflow,
  uploadPublicKey,
} from '../util';
import type {
  DheAuthenticatedClient,
  DheUnauthenticatedClient,
  IDheClientFactory,
  ISecretService,
  IToastService,
  PasswordOrPrivateKeyCredentials,
  ServerState,
  Username,
} from '../types';
import { hasInteractivePermission } from '../dh/dhe';

const logger = new Logger('UserLoginController');

/**
 * Controller for user login.
 */
export class UserLoginController extends ControllerBase {
  constructor(
    dheClientCache: URLMap<DheAuthenticatedClient>,
    dheClientFactory: IDheClientFactory,
    secretService: ISecretService,
    toastService: IToastService
  ) {
    super();

    this.dheClientCache = dheClientCache;
    this.dheClientFactory = dheClientFactory;
    this.secretService = secretService;
    this.toast = toastService;

    this.registerCommand(
      GENERATE_DHE_KEY_PAIR_CMD,
      this.onDidRequestGenerateDheKeyPair
    );

    this.registerCommand(
      CREATE_AUTHENTICATED_CLIENT_CMD,
      this.onCreateAuthenticatedClient
    );
  }

  private readonly dheClientCache: URLMap<DheAuthenticatedClient>;
  private readonly dheClientFactory: IDheClientFactory;
  private readonly secretService: ISecretService;
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
    });

    // Cancelled by user
    if (credentials == null) {
      return;
    }

    const keyPair = generateBase64KeyPair();
    const { type, publicKey } = keyPair;

    // Create a new temporary client to upload the public key
    const dheClient = await this.dheClientFactory(serverUrl);

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
   * Create an authenticated client.
   * @param serverUrl The server URL to create a client for.
   * @returns A promise that resolves when the client has been created or failed.
   */
  onCreateAuthenticatedClient = async (serverUrl: URL): Promise<void> => {
    const title = 'Login';

    const secretKeys = await this.secretService.getServerKeys(serverUrl);
    const userLoginPreferences =
      await this.secretService.getUserLoginPreferences(serverUrl);

    const privateKeyUserNames = Object.keys(secretKeys) as Username[];

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

    const { username, operateAs = username } = credentials;

    await this.secretService.storeUserLoginPreferences(serverUrl, {
      lastLogin: username,
      operateAsUser: {
        ...userLoginPreferences.operateAsUser,
        [username]: operateAs,
      },
    });

    const dheClient = await this.dheClientFactory(serverUrl);

    try {
      const authenticatedClient = await loginClient(
        dheClient,
        credentials,
        serverUrl,
        this.secretService
      );

      if (!(await hasInteractivePermission(authenticatedClient))) {
        throw new Error('User does not have interactive permissions.');
      }

      this.dheClientCache.set(serverUrl, authenticatedClient);
    } catch (err) {
      logger.error('An error occurred while connecting to DHE server:', err);
      this.dheClientCache.delete(serverUrl);
    }
  };

  private _loginClient = async (
    dheClient: DheUnauthenticatedClient,
    credentials: PasswordOrPrivateKeyCredentials,
    serverUrl: URL
  ): Promise<DheAuthenticatedClient> => {
    const { username } = credentials;

    if (credentials.type === 'password') {
      logger.debug('Login with username / password:', username);

      await dheClient.login(credentials);
    } else {
      logger.debug('Login with private key:', username);

      const keyPair = (await this.secretService.getServerKeys(serverUrl))?.[
        username
      ];

      await authWithPrivateKey({
        dheClient,
        keyPair,
        username,
        operateAs: username,
      });
    }

    return dheClient as unknown as DheAuthenticatedClient;
  };
}
