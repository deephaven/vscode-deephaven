import * as vscode from 'vscode';
import {
  DEFAULT_HIDDEN_QUERY_STATUSES,
  PERSISTENT_QUERY_HIDDEN_STATUSES_STORAGE_KEY,
  getQueryStatusSectionStatuses,
  type QueryStatusSection,
  UNSET_QUERY_STATUS,
} from '../common';
import type { IPersistentQueryStatusFilterService } from '../types';
import { Logger } from '../util';
import { DisposableBase } from './DisposableBase';

const logger = new Logger('PersistentQueryStatusFilterService');

/**
 * Backs the Persistent Queries view's status filter.
 *
 * The persisted state is the set of statuses to HIDE, not the set to show. An
 * inclusion set would make any status this extension has never heard of — a new
 * one from a future DHE release — invisible by default and unreachable from the
 * picker; with an exclusion set an unknown status is visible until the user
 * hides it, and a filter persisted today stays meaningful as the status
 * vocabulary grows.
 *
 * The set lives in `globalState` so one filter applies across every workspace.
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
      readHiddenStatuses(context).map(normalizeQueryStatus)
    );
  }

  private readonly _context: vscode.ExtensionContext;
  private _hiddenStatuses: Set<string>;

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
   * Whether any status in the section is currently listed. A section the user
   * has partly hidden through the per-status picker still counts as shown: the
   * checkbox answers "am I seeing any of these?", so unchecking it hides the
   * rest rather than doing nothing.
   * @param section The section to check.
   */
  isSectionVisible = (section: QueryStatusSection): boolean => {
    return getQueryStatusSectionStatuses(section).some(status =>
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

  /** The statuses currently hidden (normalised; unset is `''`). */
  getHiddenStatuses = (): ReadonlySet<string> => {
    return this._hiddenStatuses;
  };

  /**
   * Replace the hidden set and persist it. `onDidUpdate` only fires when the
   * set actually changed, so a picker dismissed on the same selection doesn't
   * churn the tree.
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

    this._hiddenStatuses = next;

    await this._context.globalState.update(
      PERSISTENT_QUERY_HIDDEN_STATUSES_STORAGE_KEY,
      [...next]
    );

    this._onDidUpdate.fire();
  };

  protected override async onDisposing(): Promise<void> {
    this._onDidUpdate.dispose();
  }
}

/**
 * Normalise a PQ status to its hidden-set key. `null`, `undefined`, and `''`
 * are all ways the server / JS API report "no status", so they collapse to one
 * entry.
 * @param status The status to normalise.
 */
function normalizeQueryStatus(status: string | null | undefined): string {
  return status == null ? UNSET_QUERY_STATUS : status;
}

/**
 * Read the persisted hidden set, falling back to the default only when nothing
 * has ever been stored. An empty stored array means the user deliberately unhid
 * everything, so it must be distinguished from "never set" (`undefined`) —
 * treating it as falsy would spring the default filter back on every reload. A
 * value that isn't an array of strings (a hand-edited or stale state file) is
 * discarded in favour of the default rather than throwing on startup.
 * @param context Extension context holding the `globalState`.
 */
function readHiddenStatuses(context: vscode.ExtensionContext): string[] {
  const stored = context.globalState.get(
    PERSISTENT_QUERY_HIDDEN_STATUSES_STORAGE_KEY
  );

  if (stored === undefined) {
    return [...DEFAULT_HIDDEN_QUERY_STATUSES];
  }

  if (
    !Array.isArray(stored) ||
    stored.some(status => typeof status !== 'string')
  ) {
    logger.debug(
      'Discarding malformed persisted PQ status filter:',
      JSON.stringify(stored)
    );
    return [...DEFAULT_HIDDEN_QUERY_STATUSES];
  }

  return stored as string[];
}
