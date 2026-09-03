import type * as vscode from 'vscode';
import type {
  IPersistentQueryService,
  IPersistentQueryStatusFilterService,
  IServerManager,
  PersistentQueryNode,
  PersistentQueryTreeNode,
} from '../types';
import { UNSET_QUERY_STATUS } from '../common';
import { ServerTreeProviderBase } from './ServerTreeProviderBase';
import {
  getConnectionServerLabel,
  getPanelVariableTreeItem,
  getPersistentQueryHiddenTreeItem,
  getPersistentQueryObjectLeaves,
  getPersistentQueryServerTreeItem,
  getPersistentQueryStatus,
  getPersistentQueryTreeItem,
  isPersistentQueryHiddenNode,
  isPersistentQueryNode,
} from '../util';

/**
 * Tree data provider backing the **Persistent Queries** view. Lists the
 * ACL-visible non-InteractiveConsole persistent queries of each connected DHE
 * server (from the shared `IPersistentQueryService`), each expandable to its
 * exported objects. Selecting an object opens it via `OPEN_VARIABLE_PANELS_CMD`,
 * the same panel path — and the same panel — the Interactive Consoles tree uses.
 * No console session and no "attach": the object nodes offer no delete action,
 * and the server-side PQ is never deleted.
 *
 * Which queries are listed is governed by the shared status filter
 * (`IPersistentQueryStatusFilterService`). A server whose filter hides anything
 * gets a trailing "More (N)" node, so a filter is never a silent omission.
 *
 * Tree shape — each node is one member of `PersistentQueryTreeNode`:
 *
 *   ServerState                        connected DHE servers, sorted by label
 *   ├── PersistentQueryNode            alphabetized, status-filtered
 *   │   └── [URL, VariableDefintion]   object leaf, opens a panel on click
 *   └── PersistentQueryHiddenNode      trailing "More (N)", only when filtered
 */
export class PersistentQueryTreeProvider extends ServerTreeProviderBase<PersistentQueryTreeNode> {
  constructor(
    serverManager: IServerManager,
    persistentQueryService: IPersistentQueryService,
    statusFilterService: IPersistentQueryStatusFilterService
  ) {
    super(serverManager);
    this._persistentQueryService = persistentQueryService;
    this._statusFilterService = statusFilterService;

    // Refresh whenever the PQ set ticks, or the user changes which statuses are
    // listed.
    this.disposables.add(
      this._persistentQueryService.onDidUpdate(() => {
        this._onDidChangeTreeData.fire();
      })
    );
    this.disposables.add(
      this._statusFilterService.onDidUpdate(() => {
        this._onDidChangeTreeData.fire();
      })
    );
  }

  private readonly _persistentQueryService: IPersistentQueryService;
  private readonly _statusFilterService: IPersistentQueryStatusFilterService;

  getTreeItem = async (
    node: PersistentQueryTreeNode
  ): Promise<vscode.TreeItem> => {
    // Object leaf node ([URL, VariableDefintion]). Rendered with the shared panel
    // renderer so the click command is `OPEN_VARIABLE_PANELS_CMD` verbatim.
    // No delete action: this view never removes anything from a PQ.
    if (Array.isArray(node)) {
      return getPanelVariableTreeItem(node, false);
    }

    // Persistent-query node, drawn with its status circle.
    if (isPersistentQueryNode(node)) {
      return getPersistentQueryTreeItem(node);
    }

    // The trailing node standing in for whatever the filter is hiding.
    if (isPersistentQueryHiddenNode(node)) {
      return getPersistentQueryHiddenTreeItem(node);
    }

    // DHE server node grouping its persistent queries.
    return getPersistentQueryServerTreeItem(node);
  };

  /**
   * How many queries carry each status, summed across every connected DHE
   * server — the counts shown beside each row of the filter picker. Unset
   * statuses bucket under {@link UNSET_QUERY_STATUS}. Counts cover *all*
   * queries, not just visible ones, so a hidden status still shows what unhiding
   * it would bring back.
   */
  getStatusCounts = async (): Promise<Map<string, number>> => {
    const servers = this.serverManager
      .getServers({ type: 'DHE' })
      .filter(server => server.isConnected);

    const counts = new Map<string, number>();

    for (const server of servers) {
      const queryInfos =
        await this._persistentQueryService.getPersistentQueryInfos(server.url);

      for (const queryInfo of queryInfos) {
        const status =
          getPersistentQueryStatus(queryInfo) ?? UNSET_QUERY_STATUS;
        counts.set(status, (counts.get(status) ?? 0) + 1);
      }
    }

    return counts;
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

    // The hidden-count node is a leaf.
    if (isPersistentQueryHiddenNode(elementOrRoot)) {
      return [];
    }

    // Object leaves have no children.
    if (Array.isArray(elementOrRoot)) {
      return [];
    }

    // PQ node → its exported object leaves. Objects come straight off the
    // running PQ's `designated.objects` (no console session, no connect-on-
    // expand needed — the QueryInfo already carries them). The worker URL is
    // registered as a sessionless connection so the panel can authenticate.
    if (isPersistentQueryNode(elementOrRoot)) {
      const { dheServerUrl, queryInfo } = elementOrRoot;

      const workerInfo = await this.serverManager.registerSessionlessConnection(
        dheServerUrl,
        queryInfo
      );

      if (workerInfo == null) {
        return [];
      }

      return getPersistentQueryObjectLeaves(workerInfo.workerUrl, queryInfo);
    }

    // Server node → its persistent queries, filtered by status and sorted by
    // name, with a trailing node accounting for whatever the filter hid.
    const dheServerUrl = elementOrRoot.url;
    const queries =
      await this._persistentQueryService.getPersistentQueryInfos(dheServerUrl);

    // Filter before sorting: the filter is a set lookup per query, while the
    // sort is `localeCompare` over whatever survives. On a server with tens of
    // thousands of queries and a filter showing a handful, that is the
    // difference between sorting the handful and sorting everything.
    const visible = queries
      .filter(queryInfo =>
        this._statusFilterService.isVisible(getPersistentQueryStatus(queryInfo))
      )
      .sort((a, b) => a.name.localeCompare(b.name));

    const children: PersistentQueryTreeNode[] = visible.map(
      (queryInfo): PersistentQueryNode => ({ dheServerUrl, queryInfo })
    );

    const hiddenCount = queries.length - visible.length;

    // Always last, and only when something is actually hidden — a filter that
    // hides nothing needs no footnote.
    if (hiddenCount > 0) {
      children.push({ dheServerUrl, hiddenCount });
    }

    return children;
  };
}
