import * as vscode from 'vscode';
import { URLMap } from './URLMap';
import type {
  Disposable,
  IPanelService,
  VariableID,
  VariablePanelMap,
} from '../types';

export class PanelService implements IPanelService, Disposable {
  constructor() {
    this._cnPanelMap = new URLMap<VariablePanelMap>();
  }

  private readonly _cnPanelMap: URLMap<VariablePanelMap>;

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
   * Check if a panel is associated with a given connection url + variable id.
   * @param url
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
}
