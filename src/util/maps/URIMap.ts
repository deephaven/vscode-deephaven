import * as vscode from 'vscode';
import { SerializedKeyMap } from './SerializedKeyMap';

/**
 * Map that uses `vscode.Uri`s as keys. Internally serializes keys to strings
 * for value equality. Since keys are deserialized back to uris, they will not
 * maintain reference equalty with original keys.
 */
export class URIMap<T> extends SerializedKeyMap<vscode.Uri, T> {
  deserializeKey(uriString: string): vscode.Uri {
    return vscode.Uri.parse(uriString);
  }

  serializeKey(uri: vscode.Uri): string {
    return uri.toString();
  }
}
