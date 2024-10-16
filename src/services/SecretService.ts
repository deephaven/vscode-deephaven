import type { SecretStorage } from 'vscode';
import type { ServerSecretKeys, UserLoginPreferences } from '../types';

class Key {
  static operateAsUser(serverUrl: URL): string {
    return `operateAsUser.${serverUrl.toString()}`;
  }

  static serverKeys(serverUrl: URL): string {
    return `serverKeys.${serverUrl.toString()}`;
  }
}

/**
 * Wrapper around `vscode.SecretStorage` for storing and retrieving secrets.
 * NOTE: For debugging, the secret store contents can be dumped to devtools
 * console via:
 * > Developer: Log Storage Database Contents
 */
export class SecretService {
  constructor(secrets: SecretStorage) {
    this._secrets = secrets;
  }

  private readonly _secrets: SecretStorage;

  /**
   * Parse a stored JSON string value to an object.
   * @param key Secret storage key
   * @returns An object of type T or null if a value cannot be found or parsed.
   */
  _getJson = async <T>(key: string): Promise<T | null> => {
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
  _storeJson = async <T>(key: string, value: T): Promise<void> => {
    return this._secrets.store(key, JSON.stringify(value));
  };

  /**
   * Get user login preferences for a given server.
   * @param serverUrl The server URL to get the map for.
   * @returns The user login preferences for the server.
   */
  getUserLoginPreferences = async (
    serverUrl: URL
  ): Promise<UserLoginPreferences> => {
    const preferences = await this._getJson<UserLoginPreferences>(
      Key.operateAsUser(serverUrl)
    );
    return preferences ?? { operateAsUser: {} };
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
    const key = Key.operateAsUser(serverUrl);
    await this._storeJson(key, preferences);
  };

  /**
   * Get a map of user -> private keys for a given server.
   * @param serverUrl
   * @returns The map of user -> private key or null.
   */
  getServerKeys = async (serverUrl: URL): Promise<ServerSecretKeys> => {
    const maybeServerKeys = await this._getJson<ServerSecretKeys>(
      Key.serverKeys(serverUrl)
    );
    return maybeServerKeys ?? {};
  };

  /**
   * Store a map of user -> private keys for a given server.
   * @param serverUrl The server URL to store the map for.
   * @param serverKeys The map of user -> private key.
   */
  storeServerKeys = async (
    serverUrl: URL,
    serverKeys: ServerSecretKeys
  ): Promise<void> => {
    const key = Key.serverKeys(serverUrl);
    await this._storeJson(key, serverKeys);
  };
}
