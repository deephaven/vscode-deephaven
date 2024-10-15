import type { SecretStorage } from 'vscode';
import type { DHPrivateKey } from '../types';

class Key {
  static privateKey(userName: string, serverUrl: URL): string {
    return `privateKey.${userName}.${serverUrl.toString()}`;
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

  getPrivateKey = async (
    userName: string,
    serverUrl: URL
  ): Promise<DHPrivateKey | undefined> => {
    return this._secrets.get(Key.privateKey(userName, serverUrl)) as Promise<
      DHPrivateKey | undefined
    >;
  };

  storePrivateKey = async (
    userName: string,
    serverUrl: URL,
    privateKey: DHPrivateKey
  ): Promise<void> => {
    await this._secrets.store(Key.privateKey(userName, serverUrl), privateKey);
  };
}
