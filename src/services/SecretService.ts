import type { SecretStorage } from 'vscode';
import type { Username } from '@deephaven-enterprise/auth-nodejs';
import type {
  ISecretService,
  UserKeyPairs,
  UserLoginPreferences,
} from '../types';

const OPERATE_AS_USER_KEY = 'operateAsUser' as const;
const SERVER_KEYS_KEY = 'serverKeys' as const;

/**
 * Wrapper around `vscode.SecretStorage` for storing and retrieving secrets. We
 * are storing everything as known keys so that we can easily find and delete
 * them. There don't appear to be any apis to delete all secrets at once or to
 * determine which keys exist.
 * NOTE: For debugging, the secret store contents can be dumped to devtools
 * console via:
 * > Developer: Log Storage Database Contents
 */
export class SecretService implements ISecretService {
  constructor(secrets: SecretStorage) {
    this._secrets = secrets;
  }

  private readonly _secrets: SecretStorage;

  /**
   * Parse a stored JSON string value to an object.
   * @param key Secret storage key
   * @returns An object of type T or null if a value cannot be found or parsed.
   */
  private _getJson = async <T>(key: string): Promise<T | null> => {
    const raw = await this._secrets.get(key);
    if (raw == null) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch {
      await this._secrets.delete(key);
      return null;
    }
  };

  /**
   * Store a JSON-serializable value.
   * @param key Secret storage key
   * @param value Value to store
   */
  private _storeJson = async <T>(key: string, value: T): Promise<void> => {
    return this._secrets.store(key, JSON.stringify(value));
  };

  /**
   * Clear all stored secrets.
   */
  clearStorage = async (): Promise<void> => {
    await this._secrets.delete(OPERATE_AS_USER_KEY);
    await this._secrets.delete(SERVER_KEYS_KEY);
  };

  /**
   * Get user login preferences for a given server.
   * @param serverUrl The server URL to get the map for.
   * @returns The user login preferences for the server.
   */
  getUserLoginPreferences = async (
    serverUrl: URL
  ): Promise<UserLoginPreferences> => {
    const preferences =
      await this._getJson<Record<string, UserLoginPreferences>>(
        OPERATE_AS_USER_KEY
      );

    return preferences?.[serverUrl.toString()] ?? { operateAsUser: {} };
  };

  /**
   * Store user login preferences for a given server.
   * @param serverUrl The server URL to store the map for.
   * @param preferences The user login preferences to store.
   */
  storeUserLoginPreferences = async (
    serverUrl: URL,
    preferences: UserLoginPreferences
  ): Promise<void> => {
    const existingPreferences =
      await this._getJson<Record<string, UserLoginPreferences>>(
        OPERATE_AS_USER_KEY
      );

    await this._storeJson(OPERATE_AS_USER_KEY, {
      ...existingPreferences,
      [serverUrl.toString()]: preferences,
    });
  };

  /**
   * Delete server keys for a given server + user.
   * @param serverUrl The server to delete keys for.
   * @param userName The user to delete keys for.
   * @returns A promise that resolves when the keys have been deleted.
   */
  deleteUserServerKeys = async (
    serverUrl: URL,
    userName: Username
  ): Promise<void> => {
    const existingKeys = await this.getServerKeys(serverUrl);

    if (existingKeys == null) {
      return;
    }

    delete existingKeys[userName];

    await this.storeServerKeys(serverUrl, existingKeys);
  };

  /**
   * Get a map of user -> key pairs for a given server.
   * @param serverUrl The server URL to get the map for
   * @returns The map of user -> key pairs or null.
   */
  getServerKeys = async (serverUrl: URL): Promise<UserKeyPairs> => {
    const maybeServerKeys =
      await this._getJson<Record<string, UserKeyPairs>>(SERVER_KEYS_KEY);

    return maybeServerKeys?.[serverUrl.toString()] ?? {};
  };

  /**
   * Store a map of user -> key pairs for a given server.
   * @param serverUrl The server URL to store the map for.
   * @param serverKeys The map of user -> key pairs.
   */
  storeServerKeys = async (
    serverUrl: URL,
    serverKeys: UserKeyPairs
  ): Promise<void> => {
    const existingKeys =
      await this._getJson<Record<string, UserKeyPairs>>(SERVER_KEYS_KEY);

    await this._storeJson(SERVER_KEYS_KEY, {
      ...existingKeys,
      [serverUrl.toString()]: serverKeys,
    });
  };
}
