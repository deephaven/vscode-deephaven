import * as vscode from 'vscode';
import {
  PERSISTENT_QUERY_HIDDEN_STATUSES_STORAGE_KEY,
  getQueryStatusSectionStatuses,
  type QueryStatusSection,
} from '../common';
import type { IPersistentQueryStatusFilterService } from '../types';
import { normalizeQueryStatus, parseHiddenQueryStatuses } from '../util';
import { DisposableBase } from './DisposableBase';

/**
 * Backs the Persistent Queries view's status filter. The persisted state is the
 * set of statuses to HIDE (see {@link IPersistentQueryStatusFilterService}), and
 * lives in `globalState` so one filter applies across every workspace.
 */
export class PersistentQueryStatusFilterService
  extends DisposableBase
  implements IPersistentQueryStatusFilterService
{
  /**
   * @param context Extension context providing the `globalState` the filter is
   * persisted in.
   */
  constructor(context: vscode.ExtensionContext) {
    super();
    this._context = context;
    this._hiddenStatuses = new Set(
      parseHiddenQueryStatuses(
        context.globalState.get(PERSISTENT_QUERY_HIDDEN_STATUSES_STORAGE_KEY)
      ).map(normalizeQueryStatus)
    );
  }

  private readonly _context: vscode.ExtensionContext;
  /**
   * Never reassigned — `getHiddenStatuses` hands out this very set, so callers
   * holding it must keep seeing updates. `setHiddenStatuses` mutates in place.
   */
  private readonly _hiddenStatuses: Set<string>;

  private readonly _onDidUpdate = new vscode.EventEmitter<void>();
  readonly onDidUpdate = this._onDidUpdate.event;

  /**
   * Whether a query with the given status should be listed.
   * @param status The PQ status (`null` / `undefined` / `''` all mean unset).
   */
  isVisible = (status: string | null | undefined): boolean => {
    return !this._hiddenStatuses.has(normalizeQueryStatus(status));
  };

  /**
   * Whether *every* status in the section is currently listed — the section's
   * menu row shows a checkmark only then. A section the user has partly hidden
   * through the per-status picker reads as unchecked, so clicking it fills the
   * section in rather than clearing the remainder.
   * @param section The section to check.
   */
  isSectionFullyVisible = (section: QueryStatusSection): boolean => {
    return getQueryStatusSectionStatuses(section).every(status =>
      this.isVisible(status)
    );
  };

  /**
   * Show or hide every status in a section at once.
   * @param section The section to toggle.
   * @param isVisible Whether its statuses should be listed.
   */
  setSectionVisible = async (
    section: QueryStatusSection,
    isVisible: boolean
  ): Promise<void> => {
    const hidden = new Set(this._hiddenStatuses);

    for (const status of getQueryStatusSectionStatuses(section)) {
      if (isVisible) {
        hidden.delete(status);
      } else {
        hidden.add(status);
      }
    }

    await this.setHiddenStatuses(hidden);
  };

  /**
   * The statuses currently hidden (normalised; unset is `''`). This is a live
   * view of the service's own set, not a copy — it tracks later changes.
   */
  getHiddenStatuses = (): ReadonlySet<string> => {
    return this._hiddenStatuses;
  };

  /**
   * Replace the hidden statuses and persist them. `onDidUpdate` only fires when
   * the set actually changed, so a picker dismissed on the same selection
   * doesn't churn the tree.
   * @param hidden The statuses to hide.
   */
  setHiddenStatuses = async (hidden: Iterable<string>): Promise<void> => {
    const next = new Set([...hidden].map(normalizeQueryStatus));

    if (
      next.size === this._hiddenStatuses.size &&
      [...next].every(status => this._hiddenStatuses.has(status))
    ) {
      return;
    }

    // Persisted before the in-memory set is touched so a rejected write leaves
    // storage and `_hiddenStatuses` agreeing on the old value, rather than
    // callers observing a filter that was never saved and never announced.
    await this._context.globalState.update(
      PERSISTENT_QUERY_HIDDEN_STATUSES_STORAGE_KEY,
      [...next]
    );

    // Mutated in place rather than replaced — see `_hiddenStatuses`. `next` is
    // already a copy, so this is safe even when a caller passes the set
    // returned by `getHiddenStatuses`.
    this._hiddenStatuses.clear();
    for (const status of next) {
      this._hiddenStatuses.add(status);
    }

    this._onDidUpdate.fire();
  };

  protected override async onDisposing(): Promise<void> {
    this._onDidUpdate.dispose();
  }
}
