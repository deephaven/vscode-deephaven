import * as vscode from 'vscode';
import type { PythonModuleFullname } from '../types';
import { Logger } from '../util';
import { DisposableBase } from './DisposableBase';
import type { FilteredWorkspace } from './FilteredWorkspace';

const logger = new Logger('PythonControllerImportScanner');

const DEBOUNCE_MS = 500;

/**
 * Scans workspace Python files for `deephaven_enterprise.controller_import.meta_import()`
 * usage and extracts the controller prefix argument.
 *
 * Supported patterns:
 * 1. `import deephaven_enterprise.controller_import` + `meta_import()` call
 * 2. `from deephaven_enterprise.controller_import import meta_import` + `meta_import()` call
 *
 * Limitations:
 * - Import aliases are not detected
 * - Multiline calls are not detected
 * - First match in workspace wins
 */
export class PythonControllerImportScanner extends DisposableBase {
  constructor(
    private readonly _pythonWorkspace: FilteredWorkspace<PythonModuleFullname>
  ) {
    super();

    this.disposables.add(
      this._pythonWorkspace.onDidUpdate(() => {
        this._scheduleScan();
      })
    );

    this._scheduleScan();
  }

  private _controllerPrefix: string | null = null;
  private _scanDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  private _onDidUpdatePrefix = new vscode.EventEmitter<string | null>();
  readonly onDidUpdatePrefix = this._onDidUpdatePrefix.event;

  /**
   * Get the current controller prefix, or null if not configured.
   */
  getControllerPrefix(): string | null {
    return this._controllerPrefix;
  }

  protected override async onDisposing(): Promise<void> {
    if (this._scanDebounceTimer !== null) {
      clearTimeout(this._scanDebounceTimer);
      this._scanDebounceTimer = null;
    }
    this._onDidUpdatePrefix.dispose();
  }

  /**
   * Schedule a debounced workspace scan.
   */
  private _scheduleScan(): void {
    if (this._scanDebounceTimer !== null) {
      clearTimeout(this._scanDebounceTimer);
    }

    this._scanDebounceTimer = setTimeout(() => {
      this._scanDebounceTimer = null;
      this._scanWorkspace().catch(err => {
        logger.error('Error scanning workspace:', err);
      });
    }, DEBOUNCE_MS);
  }

  /**
   * Scan all Python files in the workspace for meta_import usage.
   * Stops after the first match is found (first-match-wins strategy).
   */
  private async _scanWorkspace(): Promise<void> {
    const allFiles = await vscode.workspace.findFiles(
      '**/*.py',
      '**/node_modules/**'
    );

    for (const fileUri of allFiles) {
      try {
        const bytes = await vscode.workspace.fs.readFile(fileUri);
        const text = Buffer.from(bytes).toString('utf8');

        const prefix = this._extractControllerPrefix(text);
        if (prefix !== null) {
          if (this._controllerPrefix !== prefix) {
            this._controllerPrefix = prefix;
            this._onDidUpdatePrefix.fire(prefix);
          }
          return;
        }
      } catch (err) {
        logger.warn('Failed to read file:', fileUri.fsPath, err);
      }
    }

    // No configuration found
    if (this._controllerPrefix !== null) {
      this._controllerPrefix = null;
      this._onDidUpdatePrefix.fire(null);
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
      return match1[1] ?? 'controller';
    }

    // Pattern 2: from deephaven_enterprise.controller_import import meta_import
    //            followed by meta_import() call
    const fromImportPattern =
      /from\s+deephaven_enterprise\.controller_import\s+import\s+meta_import/;
    if (fromImportPattern.test(pythonCode)) {
      const callPattern = /\bmeta_import\(\s*(?:["'](\w+)["'])?\s*\)/;
      const match2 = callPattern.exec(pythonCode);
      if (match2 != null) {
        return match2[1] ?? 'controller';
      }
    }

    return null;
  }
}
