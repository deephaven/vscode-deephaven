import * as vscode from 'vscode';
import { SerializedKeySet } from './SerializedKeySet';

/**
 * Set that uses `vscode.Uri`s as keys. Internally serializes keys to strings
 * for value equality. Since keys are deserialized back to uris, they will not
 * maintain reference equalty with original keys.
 */
export class URISet extends SerializedKeySet<vscode.Uri> {
  serializeKey(key: vscode.Uri): string {
    return key.toString();
  }

  deserializeKey(key: string): vscode.Uri {
    return vscode.Uri.parse(key);
  }
}
