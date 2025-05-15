import * as vscode from 'vscode';
import { URIMap } from './URIMap';
import { assertDefined } from '../crossModule';

/**
 * Cache for parsed documents. Cached based on document uri + version.
 */
export class ParsedDocumentCache<TParsed> {
  constructor(parserFn: (document: vscode.TextDocument) => TParsed) {
    this._parserFn = parserFn;

    // Clear caches on document close
    vscode.workspace.onDidCloseTextDocument(document => {
      this._parsedCache.delete(document.uri);
      this._version.delete(document.uri);
    });
  }

  private readonly _parsedCache = new URIMap<TParsed>();
  private readonly _version = new URIMap<number>();
  private readonly _parserFn: (document: vscode.TextDocument) => TParsed;

  /**
   * Get parsed document. Updates the cache if the given document version differs
   * from the cached version.
   * @param document The document to parse
   * @returns Parsed document
   */
  // If the requested version doesn't match the cached version, re-parse.
  get(document: vscode.TextDocument): TParsed {
    if (this._version.get(document.uri) !== document.version) {
      const uri = document.uri;

      const parsed = this._parserFn(document);

      this._parsedCache.set(uri, parsed);
      this._version.set(uri, document.version);
    }

    const parsed = this._parsedCache.get(document.uri);

    assertDefined(parsed, 'parsed');

    return parsed;
  }
}
