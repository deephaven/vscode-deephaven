import * as vscode from 'vscode';
import type {
  IPanelService,
  IPersistentQueryService,
  IServerManager,
  PersistentQueryNode,
  ServerConnectionPanelNode,
} from '../types';
import { ServerTreeProviderBase } from './ServerTreeProviderBase';
import {
  canBrowsePersistentQueryObjects,
  getConnectionServerTreeItem,
  getConnectionTreeRootNodes,
  getPanelConnectionTreeItem,
  getPanelVariableLeaves,
  getPanelVariableTreeItem,
  getPersistentQueryObjectLeaves,
  getPersistentQueryObjects,
  getPersistentQueryTreeItem,
  isPersistentQueryNode,
  isServerStateNode,
  sortByStringProp,
} from '../util';
import { getFirstSupportedConsoleType } from '../services';

/**
 * Tree data provider backing the **Panels** view. Each server node lists its
 * console worker connections (panels come from the live session) plus the
 * persistent queries whose exported objects can be opened — a PQ is listed here
 * only when it has objects and a browsable worker, since opening panels is the
 * whole point of this view. Dead-end PQs (stopped, no objects, no IDE endpoint)
 * are left to the Persistent Queries view.
 */
export class ServerConnectionPanelTreeProvider extends ServerTreeProviderBase<ServerConnectionPanelNode> {
  constructor(
    serverManager: IServerManager,
    panelService: IPanelService,
    persistentQueryService: IPersistentQueryService
  ) {
    super(serverManager);
    this._panelService = panelService;
    this._persistentQueryService = persistentQueryService;

    this._panelService.onDidUpdate(() => {
      this._onDidChangeTreeData.fire();
    });

    // Refresh whenever the PQ set ticks.
    this.disposables.add(
      this._persistentQueryService.onDidUpdate(() => {
        this._onDidChangeTreeData.fire();
      })
    );
  }

  private readonly _panelService: IPanelService;
  private readonly _persistentQueryService: IPersistentQueryService;

  getTreeItem = async (
    node: ServerConnectionPanelNode
  ): Promise<vscode.TreeItem> => {
    // Variable leaf node. A leaf hanging off a PQ is hosted by a browse
    // connection and is browse-only, so it gets no delete action; variables in a
    // console session do.
    if (Array.isArray(node)) {
      const [workerUrl] = node;
      const isBrowseOnly =
        this.serverManager.getConnection(workerUrl)?.isBrowseConnection ===
        true;

      return getPanelVariableTreeItem(node, !isBrowseOnly);
    }

    // Persistent-query node grouping its exported objects. Language icon, not a
    // status circle: every PQ listed here is running, and this view's other
    // children are console workers drawn the same way.
    if (isPersistentQueryNode(node)) {
      return getPersistentQueryTreeItem(node);
    }

    // DHE server node grouping its worker connections + persistent queries.
    if (isServerStateNode(node)) {
      return getConnectionServerTreeItem(node);
    }

    return getPanelConnectionTreeItem(
      node,
      getFirstSupportedConsoleType,
      node.label
    );
  };

  getChildren = async (
    elementOrRoot?: ServerConnectionPanelNode
  ): Promise<ServerConnectionPanelNode[]> => {
    // Root: one server node per server that has connections.
    if (elementOrRoot == null) {
      return getConnectionTreeRootNodes(this.serverManager);
    }

    // Variable leaf nodes have no children.
    if (Array.isArray(elementOrRoot)) {
      return [];
    }

    // PQ node -> its exported object leaves. The worker URL is registered as a
    // browse connection so the embed panel can authenticate.
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

    // Server node -> its worker connections, then its openable PQs.
    if (isServerStateNode(elementOrRoot)) {
      const connections = this.serverManager
        .getConnections(elementOrRoot.url)
        .sort(sortByStringProp('serverUrl'));

      if (elementOrRoot.type !== 'DHE') {
        return connections;
      }

      const serverUrl = elementOrRoot.url;
      const queries =
        await this._persistentQueryService.getPersistentQueries(serverUrl);

      const persistentQueryNodes = queries
        .filter(
          queryInfo =>
            getPersistentQueryObjects(queryInfo).length > 0 &&
            canBrowsePersistentQueryObjects(queryInfo)
        )
        .map(
          (queryInfo): PersistentQueryNode => ({
            dheServerUrl: serverUrl,
            queryInfo,
          })
        );

      return [...connections, ...persistentQueryNodes];
    }

    // Connection node -> its panel variables (only ones that can open).
    return getPanelVariableLeaves(this._panelService, elementOrRoot.serverUrl);
  };
}
