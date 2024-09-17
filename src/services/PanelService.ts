import * as vscode from 'vscode';
import { URLMap } from './URLMap';
import type {
  Disposable,
  IPanelService,
  VariableChanges,
  VariableDefintion,
  VariableID,
  VariableMap,
  VariablePanelMap,
} from '../types';

export class PanelService implements IPanelService, Disposable {
  constructor() {
    this._cnPanelMap = new URLMap<VariablePanelMap>();
    this._cnVariableMap = new URLMap<VariableMap>();
  }

  private readonly _onDidUpdate = new vscode.EventEmitter<void>();
  readonly onDidUpdate = this._onDidUpdate.event;

  private readonly _cnPanelMap: URLMap<VariablePanelMap>;
  private readonly _cnVariableMap: URLMap<VariableMap>;

  dispose = async (): Promise<void> => {
    this._cnPanelMap.clear();
  };

  /**
   * Get the panel for the given connection url and variable id and throws if it
   * does not exist.
   * @param url
   * @param variableId
   */
  getPanelOrThrow = (url: URL, variableId: VariableID): vscode.WebviewPanel => {
    if (!this.hasPanel(url, variableId)) {
      throw new Error(`Panel not found for variable: '${url}' ${variableId}`);
    }

    return this._cnPanelMap.get(url)!.get(variableId)!;
  };

  /**
   * Delete the panel for the given connection url and variable id.
   * @param url
   * @param variableId
   */
  deletePanel = (url: URL, variableId: VariableID): void => {
    this._cnPanelMap.get(url)?.delete(variableId);
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
   * Get all variables for the given connection url that have panels.
   * @param url The connection url.
   * @returns Array of variables
   */
  getPanelVariables = (url: URL): VariableDefintion[] => {
    return [...this.getVariables(url)].filter(v => this.hasPanel(url, v.id));
  };

  /**
   * Check if a panel is associated with a given connection url + variable id.
   * @param url The connection url.
   * @param variableId
   */
  hasPanel = (url: URL, variableId: VariableID): boolean => {
    return (
      this._cnPanelMap.has(url) && this._cnPanelMap.get(url)!.has(variableId)
    );
  };

  /**
   * Associate a panel with a given connection url + variable id.
   * @param url
   * @param variableId
   * @param panel
   */
  setPanel = (
    url: URL,
    variableId: VariableID,
    panel: vscode.WebviewPanel
  ): void => {
    if (!this._cnPanelMap.has(url)) {
      this._cnPanelMap.set(url, new Map<VariableID, vscode.WebviewPanel>());
    }

    this._cnPanelMap.get(url)!.set(variableId, panel);
  };

  /**
   * Get variables for the given connection url.
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
      this.deletePanel(url, variable.id);
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
