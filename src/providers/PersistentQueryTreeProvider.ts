import type * as vscode from 'vscode';
import type {
  IPersistentQueryService,
  IServerManager,
  PersistentQueryGroup,
  PersistentQueryGroupNode,
  PersistentQueryNode,
  PersistentQueryTreeNode,
} from '../types';
import { ServerTreeProviderBase } from './ServerTreeProviderBase';
import {
  getConnectionServerLabel,
  getPanelVariableTreeItem,
  getPersistentQueryGroup,
  getPersistentQueryGroupTreeItem,
  getPersistentQueryObjectLeaves,
  getPersistentQueryServerTreeItem,
  getPersistentQueryTreeItem,
  isPersistentQueryGroupNode,
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
 * Tree shape:
 *   root      → DHE `ServerState[]`
 *   server    → `PersistentQueryGroupNode[]`  (`Running` / `Stopped`)
 *   group     → `PersistentQueryNode[]`
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

  getTreeItem = async (
    node: PersistentQueryTreeNode
  ): Promise<vscode.TreeItem> => {
    // Object leaf node (worker URL + variable). Reuse the Panels tree renderer
    // so the click command is `OPEN_VARIABLE_PANELS_CMD` verbatim. Browse-only:
    // this view never deletes anything from a PQ.
    if (Array.isArray(node)) {
      return getPanelVariableTreeItem(node, false);
    }

    // Persistent-query node. Status is carried by the group above it, so the
    // node shows its script language (or a spinner while transitional).
    if (isPersistentQueryNode(node)) {
      return getPersistentQueryTreeItem(node);
    }

    // Status group node. Rendering the count means resolving the group's
    // queries, which the service already has cached from `getChildren`.
    if (isPersistentQueryGroupNode(node)) {
      const queries = await this._getQueriesInGroup(
        node.dheServerUrl,
        node.group
      );

      return getPersistentQueryGroupTreeItem(node, queries.length);
    }

    // DHE server node grouping its persistent queries.
    return getPersistentQueryServerTreeItem(node);
  };

  /**
   * The server's persistent queries belonging to a given status group, sorted
   * by name.
   * @param dheServerUrl The DHE server URL.
   * @param group The status group to filter to.
   */
  private _getQueriesInGroup = async (
    dheServerUrl: URL,
    group: PersistentQueryGroup
  ): Promise<PersistentQueryNode[]> => {
    const queries =
      await this._persistentQueryService.getPersistentQueries(dheServerUrl);

    return queries
      .filter(queryInfo => getPersistentQueryGroup(queryInfo) === group)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((queryInfo): PersistentQueryNode => ({ dheServerUrl, queryInfo }));
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

    // Group node → its persistent queries.
    if (isPersistentQueryGroupNode(elementOrRoot)) {
      return this._getQueriesInGroup(
        elementOrRoot.dheServerUrl,
        elementOrRoot.group
      );
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

    // Server node → its status groups. Empty groups are omitted so the tree
    // never opens onto an empty list.
    const dheServerUrl = elementOrRoot.url;
    const queries =
      await this._persistentQueryService.getPersistentQueries(dheServerUrl);

    const groups: PersistentQueryGroup[] = ['Running', 'Stopped'];

    return groups
      .filter(group =>
        queries.some(queryInfo => getPersistentQueryGroup(queryInfo) === group)
      )
      .map((group): PersistentQueryGroupNode => ({ dheServerUrl, group }));
  };
}
