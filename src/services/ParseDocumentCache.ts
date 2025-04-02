import * as vscode from 'vscode';
import { URIMap } from './URIMap';
import { assertDefined } from '../util';

/**
 * Cache for parsed documents. Cached based on document uri + version.
 */
export class ParsedDocumentCache<TParsed> {
  constructor(parserFn: (document: vscode.TextDocument) => TParsed) {
    this._parserFn = parserFn;

    // Update caches on document change
    vscode.workspace.onDidChangeTextDocument(event => {
      const document = event.document;
      const uri = document.uri;
      const latestVersion = this._latestVersion.get(uri);

      // Update cache with latest version
      if (latestVersion == null || latestVersion < document.version) {
        this._updateCaches(document);
      }
    });

    // Clear caches on document close
    vscode.workspace.onDidCloseTextDocument(document => {
      this._parsedCache.delete(document.uri);
      this._latestVersion.delete(document.uri);
    });
  }

  private readonly _parsedCache = new URIMap<TParsed>();
  private readonly _latestVersion = new URIMap<number>();
  private readonly _parserFn: (document: vscode.TextDocument) => TParsed;

  /**
   * Update the caches.
   */
  private _updateCaches(document: vscode.TextDocument): void {
    const uri = document.uri;

    const parsed = this._parserFn(document);

    this._parsedCache.set(uri, parsed);
    this._latestVersion.set(uri, document.version);
  }

  /**
   * Get parsed document. Updates the cache if the given document version differs
   * from the last version.
   * @param document The document to parse
   * @returns Parsed document
   */
  get(document: vscode.TextDocument): TParsed {
    const lastVersion = this._latestVersion.get(document.uri);

    // If the requested version doesn't match the cached version, re-parse.
    if (lastVersion !== document.version) {
      this._updateCaches(document);
    }

    const parsed = this._parsedCache.get(document.uri);

    assertDefined(parsed, 'codeBlparsedocks');

    return parsed;
  }
}
