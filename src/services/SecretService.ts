import type { SecretStorage } from 'vscode';
import type { OperateAsUserStored, ServerSecretKeysStored } from '../types';

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
   * Get a map of user -> operatas users for a given server.
   * @param serverUrl The server URL to get the map for.
   * @returns The map of user -> operate as user or null.
   */
  getOperateAsUser = async (
    serverUrl: URL
  ): Promise<OperateAsUserStored | null> => {
    return this._getJson(Key.operateAsUser(serverUrl));
  };

  /**
   * Store a map of user -> operate as user for a given server.
   * @param serverUrl The server URL to store the map for.
   * @param operateAsUser The map of user -> operate as user.
   */
  storeOperateAsUser = async (
    serverUrl: URL,
    operateAsUser: string
  ): Promise<void> => {
    const key = Key.operateAsUser(serverUrl);
    await this._storeJson(key, operateAsUser);
  };

  /**
   * Get a map of user -> private keys for a given server.
   * @param serverUrl
   * @returns The map of user -> private key or null.
   */
  getServerKeys = async (
    serverUrl: URL
  ): Promise<ServerSecretKeysStored | null> => {
    return this._getJson(Key.serverKeys(serverUrl));
  };

  /**
   * Store a map of user -> private keys for a given server.
   * @param serverUrl The server URL to store the map for.
   * @param serverKeys The map of user -> private key.
   */
  storeServerKeys = async (
    serverUrl: URL,
    serverKeys: ServerSecretKeysStored
  ): Promise<void> => {
    const key = Key.serverKeys(serverUrl);
    await this._storeJson(key, serverKeys);
  };
}
