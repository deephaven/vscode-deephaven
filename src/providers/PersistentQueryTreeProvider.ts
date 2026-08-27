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
  formatCount,
  getConnectionServerLabel,
  getPanelVariableTreeItem,
  getPersistentQueryObjectLeaves,
  getPersistentQueryServerTreeItem,
  getPersistentQueryStatus,
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
 * Which queries are listed is governed by the shared status filter
 * (`IPersistentQueryStatusFilterService`); the server node's description states
 * what the filter is doing, since a filter with no visible effect reads as a
 * missing query.
 *
 * Tree shape:
 *   root      → DHE `ServerState[]`
 *   server    → `PersistentQueryNode[]`      (alphabetized, status-filtered)
 *   PQ        → `[URL, VariableDefintion][]` (object leaves, opened on click)
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

    // Refresh whenever the PQ set ticks.
    this.disposables.add(
      this._persistentQueryService.onDidUpdate(() => {
        this._onDidChangeTreeData.fire();
      })
    );

    // ...or whenever the user changes which statuses are listed.
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
    // Object leaf node (worker URL + variable). Reuse the Panels tree renderer
    // so the click command is `OPEN_VARIABLE_PANELS_CMD` verbatim. Browse-only:
    // this view never deletes anything from a PQ.
    if (Array.isArray(node)) {
      return getPanelVariableTreeItem(node, false);
    }

    // Persistent-query node, drawn with its status circle.
    if (isPersistentQueryNode(node)) {
      return getPersistentQueryTreeItem(node);
    }

    // DHE server node grouping its persistent queries. Its description is the
    // only always-visible statement of what the filter is hiding, so it reports
    // the visible count against the total whenever a filter is active.
    const queries = await this._persistentQueryService.getPersistentQueries(
      node.url
    );
    const visibleCount = queries.filter(queryInfo =>
      this._statusFilterService.isVisible(getPersistentQueryStatus(queryInfo))
    ).length;

    return {
      ...getPersistentQueryServerTreeItem(node),
      description:
        visibleCount === queries.length
          ? `(${formatCount(queries.length)})`
          : `(${formatCount(visibleCount)} of ${formatCount(queries.length)})`,
    };
  };

  /**
   * How many queries carry each status, summed across every connected DHE
   * server — the counts shown beside each row of the filter picker. Unset
   * statuses bucket under {@link UNSET_QUERY_STATUS}, matching the filter's own
   * normalisation. Counts are of *all* queries, not just the visible ones:
   * a hidden status still needs its count so the user can see what unhiding it
   * would bring back.
   */
  getStatusCounts = async (): Promise<Map<string, number>> => {
    const servers = this.serverManager
      .getServers({ type: 'DHE' })
      .filter(server => server.isConnected);

    const counts = new Map<string, number>();

    for (const server of servers) {
      const queries = await this._persistentQueryService.getPersistentQueries(
        server.url
      );

      for (const queryInfo of queries) {
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

    // Server node → its persistent queries, filtered by status and sorted by
    // name.
    const dheServerUrl = elementOrRoot.url;
    const queries =
      await this._persistentQueryService.getPersistentQueries(dheServerUrl);

    return queries
      .filter(queryInfo =>
        this._statusFilterService.isVisible(getPersistentQueryStatus(queryInfo))
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((queryInfo): PersistentQueryNode => ({ dheServerUrl, queryInfo }));
  };
}
