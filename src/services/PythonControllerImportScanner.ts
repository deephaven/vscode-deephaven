import * as vscode from 'vscode';
import type { PythonModuleFullname } from '../types';
import { Logger, URIMap, URISet } from '../util';
import { DisposableBase } from './DisposableBase';
import type { FilteredWorkspace } from './FilteredWorkspace';

const logger = new Logger('PythonControllerImportScanner');

const DEBOUNCE_MS = 500 as const;
const DEFAULT_META_IMPORT_PREFIX = 'controller' as const;

/**
 * Scans workspace Python files for `deephaven_enterprise.controller_import.meta_import()`
 * usage and extracts the controller prefix arguments.
 *
 * Supported patterns:
 * 1. `import deephaven_enterprise.controller_import` + `deephaven_enterprise.controller_import.meta_import()` call
 * 2. `from deephaven_enterprise import controller_import` + `controller_import.meta_import()` call
 * 3. `from deephaven_enterprise.controller_import import meta_import` + `meta_import()` call
 *
 * Limitations:
 * - Import aliases are not detected
 * - Multiline calls are not detected
 */
export class PythonControllerImportScanner extends DisposableBase {
  constructor(
    private readonly _pythonWorkspace: FilteredWorkspace<PythonModuleFullname>
  ) {
    super();

    // Track individual file changes
    this.disposables.add(
      this._pythonWorkspace.onDidChangeFile(({ type, uri }) => {
        if (type === 'delete') {
          this._setPrefix(uri, null);
        } else {
          this._pendingFileScans.add(uri);
          this._scheduleScan();
        }
      })
    );

    this.disposables.add(
      this._pythonWorkspace.onDidUpdate(() => {
        this._scanAllFiles();
      })
    );

    // Queue all files for initial scan
    this._scanAllFiles();
  }

  private _filePrefixMap = new URIMap<string>();
  private _prefixFilesMap = new Map<string, URISet>();
  private _scanDebounceTimer?: NodeJS.Timeout;
  private _pendingFileScans = new URISet();

  private _onDidUpdatePrefixes = new vscode.EventEmitter<void>();
  readonly onDidUpdatePrefixes = this._onDidUpdatePrefixes.event;

  /**
   * Get all controller prefixes found in the workspace.
   */
  getControllerPrefixes(): ReadonlySet<string> {
    return new Set(this._prefixFilesMap.keys());
  }

  protected override async onDisposing(): Promise<void> {
    clearTimeout(this._scanDebounceTimer);
    this._onDidUpdatePrefixes.dispose();
  }

  /**
   * Schedule a debounced scan of pending files.
   */
  private _scheduleScan(): void {
    clearTimeout(this._scanDebounceTimer);

    this._scanDebounceTimer = setTimeout(() => {
      void this._scanPendingFiles();
    }, DEBOUNCE_MS);
  }

  private _scanAllFiles(): void {
    const allFiles = this._pythonWorkspace.getAllFileUris();
    for (const fileUri of allFiles) {
      this._pendingFileScans.add(fileUri);
    }
    this._scheduleScan();
  }

  /**
   * Scan pending files that have changed.
   */
  private async _scanPendingFiles(): Promise<void> {
    try {
      const filesToScan = [...this._pendingFileScans.keys()];
      this._pendingFileScans.clear();

      for (const fileUri of filesToScan) {
        await this._scanFile(fileUri);
      }
    } catch (err) {
      logger.error('Error scanning pending files:', err);
    }
  }

  /**
   * Scan a single file for meta_import usage and update tracking maps.
   */
  private async _scanFile(fileUri: vscode.Uri): Promise<void> {
    try {
      const bytes = await vscode.workspace.fs.readFile(fileUri);
      const text = Buffer.from(bytes).toString('utf8');

      const newPrefix = this._extractControllerPrefix(text);
      this._setPrefix(fileUri, newPrefix);
    } catch (err) {
      logger.warn('Failed to read file:', fileUri.fsPath, err);
      this._setPrefix(fileUri, null);
    }
  }

  /**
   * Set the prefix for a file. Updates both tracking maps and fires event if
   * the prefix set changed.
   */
  private _setPrefix(fileUri: vscode.Uri, prefix: string | null): void {
    const oldPrefix = this._filePrefixMap.get(fileUri) ?? null;

    if (oldPrefix === prefix) {
      return;
    }

    let didUpdate = false;

    if (prefix == null) {
      this._filePrefixMap.delete(fileUri);
    } else {
      logger.debug(
        `Found controller meta_import(${prefix === DEFAULT_META_IMPORT_PREFIX ? '' : `"${prefix}"`}) in file '${fileUri.fsPath}'`
      );
      this._filePrefixMap.set(fileUri, prefix);
    }

    if (oldPrefix != null) {
      const fileSet = this._prefixFilesMap.get(oldPrefix);

      if (fileSet != null) {
        fileSet.delete(fileUri);

        if (fileSet.size === 0) {
          this._prefixFilesMap.delete(oldPrefix);
          didUpdate = true;
        }
      }
    }

    if (prefix != null) {
      let fileSet = this._prefixFilesMap.get(prefix);

      if (fileSet == null) {
        fileSet = new URISet();
        this._prefixFilesMap.set(prefix, fileSet);
        didUpdate = true;
      }

      fileSet.add(fileUri);
    }

    if (didUpdate) {
      this._onDidUpdatePrefixes.fire();
    }
  }

  /**
   * Extract the controller prefix from the given Python source code.
   * Returns null if no meta_import usage is detected.
   */
  private _extractControllerPrefix(pythonCode: string): string | null {
    // Pattern 1: deephaven_enterprise.controller_import.meta_import() direct call
    const directCallPattern =
      /deephaven_enterprise\.controller_import\.meta_import\(\s*(?:["'](\w+)["'])?\s*\)/;
    const match1 = directCallPattern.exec(pythonCode);
    if (match1 != null) {
      return match1[1] ?? DEFAULT_META_IMPORT_PREFIX;
    }

    // Pattern 2: from deephaven_enterprise import controller_import
    //            followed by controller_import.meta_import() call
    const fromModulePattern =
      /from\s+deephaven_enterprise\s+import\s+controller_import/;
    if (fromModulePattern.test(pythonCode)) {
      const callPattern =
        /controller_import\.meta_import\(\s*(?:["'](\w+)["'])?\s*\)/;
      const match2 = callPattern.exec(pythonCode);
      if (match2 != null) {
        return match2[1] ?? DEFAULT_META_IMPORT_PREFIX;
      }
    }

    // Pattern 3: from deephaven_enterprise.controller_import import meta_import
    //            followed by meta_import() call
    const fromImportPattern =
      /from\s+deephaven_enterprise\.controller_import\s+import\s+meta_import/;
    if (fromImportPattern.test(pythonCode)) {
      const callPattern = /\bmeta_import\(\s*(?:["'](\w+)["'])?\s*\)/;
      const match3 = callPattern.exec(pythonCode);
      if (match3 != null) {
        return match3[1] ?? DEFAULT_META_IMPORT_PREFIX;
      }
    }

    return null;
  }
}
