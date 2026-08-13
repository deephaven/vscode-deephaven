import type * as vscode from 'vscode';
import type {
  IPersistentQueryService,
  IServerManager,
  PersistentQueryNode,
  PersistentQueryTreeNode,
} from '../types';
import { ServerTreeProviderBase } from './ServerTreeProviderBase';
import {
  getConnectionServerLabel,
  getPanelVariableTreeItem,
  getPersistentQueryObjectLeaves,
  getPersistentQueryServerTreeItem,
  getPersistentQueryTreeItem,
  isPersistentQueryNode,
} from '../util';

/**
 * Tree data provider backing the **Persistent Queries** view. Lists the
 * ACL-visible non-InteractiveConsole persistent queries of each connected DHE
 * server (from the shared `IPersistentQueryService`), each expandable to its
 * exported objects. Selecting an object opens it read-only via
 * `OPEN_VARIABLE_PANELS_CMD` — the same panel path the Panels tree uses.
 * Browse-only: no console session, no "attach", and the server-side PQ is never
 * deleted.
 *
 * Tree shape (mirrors `ServerConnectionPanelTreeProvider`):
 *   root      → DHE `ServerState[]`
 *   server    → `PersistentQueryNode[]`
 *   PQ        → `[URL, VariableDefintion][]`  (object leaves, opened on click)
 */
export class PersistentQueryTreeProvider extends ServerTreeProviderBase<PersistentQueryTreeNode> {
  constructor(
    serverManager: IServerManager,
    persistentQueryService: IPersistentQueryService
  ) {
    super(serverManager);
    this._persistentQueryService = persistentQueryService;

    // Refresh whenever the PQ set ticks.
    this.disposables.add(
      this._persistentQueryService.onDidUpdate(() => {
        this._onDidChangeTreeData.fire();
      })
    );
  }

  private readonly _persistentQueryService: IPersistentQueryService;

  getTreeItem = (node: PersistentQueryTreeNode): vscode.TreeItem => {
    // Object leaf node (worker URL + variable). Reuse the Panels tree renderer
    // so the click command is `OPEN_VARIABLE_PANELS_CMD` verbatim. Browse-only:
    // this view never deletes anything from a PQ.
    if (Array.isArray(node)) {
      return getPanelVariableTreeItem(node, false);
    }

    // Persistent-query node. This view lists PQs of every status, so the node
    // carries the Servers-tree status circle.
    if (isPersistentQueryNode(node)) {
      return getPersistentQueryTreeItem(node, 'status');
    }

    // DHE server node grouping its persistent queries.
    return getPersistentQueryServerTreeItem(node);
  };

  getChildren = async (
    elementOrRoot?: PersistentQueryTreeNode
  ): Promise<PersistentQueryTreeNode[]> => {
    // Root: one node per connected DHE server.
    if (elementOrRoot == null) {
      return this.serverManager
        .getServers({ type: 'DHE' })
        .filter(server => server.isConnected)
        .sort((a, b) =>
          getConnectionServerLabel(a).localeCompare(getConnectionServerLabel(b))
        );
    }

    // Object leaves have no children.
    if (Array.isArray(elementOrRoot)) {
      return [];
    }

    // PQ node → its exported object leaves. Objects come straight off the
    // running PQ's `designated.objects` (no console session, no connect-on-
    // expand needed — the QueryInfo already carries them). The worker URL is
    // registered as a browse connection so the embed panel can authenticate.
    if (isPersistentQueryNode(elementOrRoot)) {
      const { dheServerUrl, queryInfo } = elementOrRoot;

      const workerInfo = await this.serverManager.registerBrowseConnection(
        dheServerUrl,
        queryInfo
      );

      if (workerInfo == null) {
        return [];
      }

      return getPersistentQueryObjectLeaves(
        new URL(workerInfo.workerUrl),
        queryInfo
      );
    }

    // Server node → its persistent queries (any status).
    const serverUrl = elementOrRoot.url;
    const queries =
      await this._persistentQueryService.getPersistentQueries(serverUrl);

    return queries.map(
      (queryInfo): PersistentQueryNode => ({
        dheServerUrl: serverUrl,
        queryInfo,
      })
    );
  };
}
