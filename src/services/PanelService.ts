import * as vscode from 'vscode';
import type {
  IDisposable,
  IPanelService,
  PanelKey,
  PanelVariable,
  VariableChanges,
  VariableDefintion,
  VariableMap,
  VariablePanelMap,
} from '../types';
import { URLMap } from '../util';

/**
 * Key identifying a variable's panel within a connection. Prefer the server's
 * `id`, falling back to `title` when it is missing or empty (PQ exported
 * objects have no `id`).
 * Titles are the exported variable names, so they are unique within a worker,
 * and the embed widget url addresses objects by title anyway.
 * @param variable The variable to get the panel key for.
 */
function getPanelKey({ id, title }: PanelVariable): PanelKey {
  return (id == null || id === '' ? title : id) as PanelKey;
}

export class PanelService implements IPanelService, IDisposable {
  constructor() {
    this._cnPanelMap = new URLMap<VariablePanelMap>();
    this._cnVariableMap = new URLMap<VariableMap>();
  }

  private readonly _onDidUpdate = new vscode.EventEmitter<void>();
  readonly onDidUpdate = this._onDidUpdate.event;

  private readonly _cnPanelMap: URLMap<VariablePanelMap>;
  private readonly _cnVariableMap: URLMap<VariableMap>;

  /**
   * Clear panel data for the given connection url.
   * @param url The connection url.
   */
  clearServerData = (url: URL): void => {
    this._cnPanelMap.delete(url);
    this._cnVariableMap.delete(url);
  };

  /**
   * Cleanup resources.
   */
  dispose = async (): Promise<void> => {
    this._onDidUpdate.dispose();

    await Promise.all([
      this._cnPanelMap.dispose(),
      this._cnVariableMap.dispose(),
    ]);
  };

  /**
   * Get the panel for the given connection url and variable and throws if it
   * does not exist.
   * @param url
   * @param variable
   */
  getPanelOrThrow = (
    url: URL,
    variable: PanelVariable
  ): vscode.WebviewPanel => {
    if (!this.hasPanel(url, variable)) {
      throw new Error(
        `Panel not found for variable: '${url}' ${getPanelKey(variable)}`
      );
    }

    return this._cnPanelMap.get(url)!.get(getPanelKey(variable))!.panel;
  };

  /**
   * Get all panels for the given connection url.
   * @param url The connection url.
   * @returns Iterable of panels
   */
  getPanels = (url: URL): Iterable<vscode.WebviewPanel> => {
    return [...(this._cnPanelMap.get(url)?.values() ?? [])].map(
      ({ panel }) => panel
    );
  };

  /**
   * Delete the panel for the given connection url and variable.
   * @param url
   * @param variable
   */
  deletePanel = (url: URL, variable: PanelVariable): void => {
    this._cnPanelMap.get(url)?.delete(getPanelKey(variable));
  };

  /**
   * Get all connection URLs that have panels.
   * @returns Array of URLs
   */
  getPanelUrls = (): URL[] => {
    return [...this._cnPanelMap.keys()].filter(
      url => this._cnPanelMap.get(url)?.size ?? 0 > 0
    );
  };

  /**
   * Get all variables for the given connection url that have panels. Read
   * from the panel map rather than the variable map, since PQ connections have
   * no `DhcService` to populate the latter.
   * @param url The connection url.
   * @returns Array of variables
   */
  getPanelVariables = (url: URL): PanelVariable[] => {
    return [...(this._cnPanelMap.get(url)?.values() ?? [])].map(
      ({ variable }) => variable
    );
  };

  /**
   * Check if a panel is associated with a given connection url + variable.
   * @param url The connection url.
   * @param variable
   */
  hasPanel = (url: URL, variable: PanelVariable): boolean => {
    return (
      this._cnPanelMap.has(url) &&
      this._cnPanelMap.get(url)!.has(getPanelKey(variable))
    );
  };

  /**
   * Associate a panel with a given connection url + variable.
   * @param url
   * @param variable
   * @param panel
   */
  setPanel = (
    url: URL,
    variable: PanelVariable,
    panel: vscode.WebviewPanel
  ): void => {
    if (!this._cnPanelMap.has(url)) {
      this._cnPanelMap.set(url, new Map());
    }

    this._cnPanelMap.get(url)!.set(getPanelKey(variable), { panel, variable });
  };

  /**
   * Get variables for the given connection url, as reported by `DhcService`
   * via `updateVariables`. Only populated for console connections, so this is
   * always empty for PQ connections. Use `getPanelVariables` to get the
   * variables that have open panels for any connection type.
   * @param url The connection url.
   * @returns Iterable of variables
   */
  getVariables = (url: URL): Iterable<VariableDefintion> => {
    return this._cnVariableMap.get(url)?.values() ?? [];
  };

  /**
   * Update the variables for the given connection url.
   * @param url The connection URL
   * @param variableChanges Changes made on that connection
   */
  updateVariables = (
    url: URL,
    { created, removed, updated }: VariableChanges
  ): void => {
    if (!this._cnVariableMap.has(url)) {
      this._cnVariableMap.set(url, new Map());
    }

    const variableMap = this._cnVariableMap.get(url)!;

    for (const variable of removed) {
      variableMap.delete(variable.id);
      this.deletePanel(url, variable);
    }

    for (const variable of created) {
      variableMap.set(variable.id, variable);
    }

    for (const variable of updated) {
      variableMap.set(variable.id, variable);
    }

    this._onDidUpdate.fire();
  };
}
