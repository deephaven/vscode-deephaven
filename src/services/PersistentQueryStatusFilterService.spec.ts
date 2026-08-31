import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as vscode from 'vscode';
import { PersistentQueryStatusFilterService } from './PersistentQueryStatusFilterService';
import {
  DEFAULT_HIDDEN_QUERY_STATUSES,
  LIVE_QUERY_STATUSES,
  PERSISTENT_QUERY_HIDDEN_STATUSES_STORAGE_KEY,
  UNSET_QUERY_STATUS,
} from '../common';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

/**
 * Build an extension context whose `globalState` returns `stored` for the
 * filter key. `undefined` models "never set", which must behave differently
 * from a stored empty array.
 */
function makeContext(stored?: unknown): vscode.ExtensionContext {
  return {
    globalState: {
      get: vi.fn((key: string) =>
        key === PERSISTENT_QUERY_HIDDEN_STATUSES_STORAGE_KEY
          ? stored
          : undefined
      ),
      update: vi.fn(async () => undefined),
    },
  } as unknown as vscode.ExtensionContext;
}

describe('PersistentQueryStatusFilterService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('hides the completely-stopped statuses on first run', () => {
      const service = new PersistentQueryStatusFilterService(makeContext());

      expect([...service.getHiddenStatuses()].sort()).toEqual(
        [...DEFAULT_HIDDEN_QUERY_STATUSES].sort()
      );
      expect(service.isVisible('Running')).toBe(true);
      expect(service.isVisible('Initializing')).toBe(true);
      // Still winding down, so still worth seeing.
      expect(service.isVisible('Stopping')).toBe(true);
      expect(service.isVisible('Stopped')).toBe(false);
      expect(service.isVisible(null)).toBe(false);
    });

    it('treats a stored empty array as "show everything", not as unset', () => {
      const service = new PersistentQueryStatusFilterService(makeContext([]));

      expect(service.getHiddenStatuses().size).toBe(0);
      expect(service.isVisible('Stopped')).toBe(true);
      expect(service.isVisible(null)).toBe(true);
    });

    it('restores a persisted hidden set', () => {
      const service = new PersistentQueryStatusFilterService(
        makeContext(['Running'])
      );

      expect([...service.getHiddenStatuses()]).toEqual(['Running']);
      expect(service.isVisible('Running')).toBe(false);
      expect(service.isVisible('Stopped')).toBe(true);
    });

    it.each([
      ['a non-array', { hidden: ['Stopped'] }],
      ['an array of non-strings', ['Stopped', 42]],
      ['a string', 'Stopped'],
      ['null', null],
    ])('falls back to the default for a malformed value: %s', (_l, stored) => {
      const service = new PersistentQueryStatusFilterService(
        makeContext(stored)
      );

      expect([...service.getHiddenStatuses()].sort()).toEqual(
        [...DEFAULT_HIDDEN_QUERY_STATUSES].sort()
      );
    });
  });

  describe('isVisible', () => {
    it.each([[null], [undefined], ['']])(
      'normalises an unset status to the same entry: %s',
      status => {
        const service = new PersistentQueryStatusFilterService(
          makeContext([UNSET_QUERY_STATUS])
        );

        expect(service.isVisible(status as string | null)).toBe(false);
      }
    );

    it('shows a status it does not recognize when it is not hidden', () => {
      const service = new PersistentQueryStatusFilterService(makeContext());

      expect(service.isVisible('Hibernating')).toBe(true);
    });
  });

  describe('setHiddenStatuses', () => {
    it('persists the new set and fires onDidUpdate once', async () => {
      const context = makeContext();
      const service = new PersistentQueryStatusFilterService(context);

      const onDidUpdate = vi.fn();
      service.onDidUpdate(onDidUpdate);

      await service.setHiddenStatuses(['Running', 'Running', null as never]);

      expect(context.globalState.update).toHaveBeenCalledWith(
        PERSISTENT_QUERY_HIDDEN_STATUSES_STORAGE_KEY,
        ['Running', UNSET_QUERY_STATUS]
      );
      expect([...service.getHiddenStatuses()]).toEqual([
        'Running',
        UNSET_QUERY_STATUS,
      ]);
      expect(onDidUpdate).toHaveBeenCalledTimes(1);
    });

    it('persists an empty set (hide nothing)', async () => {
      const context = makeContext();
      const service = new PersistentQueryStatusFilterService(context);

      await service.setHiddenStatuses([]);

      expect(context.globalState.update).toHaveBeenCalledWith(
        PERSISTENT_QUERY_HIDDEN_STATUSES_STORAGE_KEY,
        []
      );
      expect(service.getHiddenStatuses().size).toBe(0);
    });

    it('does not persist or fire when the set is unchanged', async () => {
      const context = makeContext();
      const service = new PersistentQueryStatusFilterService(context);

      const onDidUpdate = vi.fn();
      service.onDidUpdate(onDidUpdate);

      await service.setHiddenStatuses([...DEFAULT_HIDDEN_QUERY_STATUSES]);

      expect(context.globalState.update).not.toHaveBeenCalled();
      expect(onDidUpdate).not.toHaveBeenCalled();
    });
  });
});

describe('status sections', () => {
  it('reports the default filter as Running shown, Stopped hidden', () => {
    const service = new PersistentQueryStatusFilterService(makeContext());

    expect(service.isSectionVisible('Running')).toBe(true);
    expect(service.isSectionVisible('Stopped')).toBe(false);
  });

  it('counts a partly hidden section as still shown', async () => {
    const service = new PersistentQueryStatusFilterService(makeContext([]));

    // Hide all of Running except `Running` itself.
    await service.setHiddenStatuses(
      LIVE_QUERY_STATUSES.filter(status => status !== 'Running')
    );

    // The checkbox answers "am I seeing any of these?", so unchecking it can
    // hide the remainder rather than doing nothing.
    expect(service.isSectionVisible('Running')).toBe(true);
  });

  it('hides every status in a section', async () => {
    const service = new PersistentQueryStatusFilterService(makeContext([]));

    await service.setSectionVisible('Running', false);

    expect(service.isSectionVisible('Running')).toBe(false);
    for (const status of LIVE_QUERY_STATUSES) {
      expect(service.isVisible(status)).toBe(false);
    }
    // The other section is untouched.
    expect(service.isSectionVisible('Stopped')).toBe(true);
  });

  it('shows every status in a section, including the unset one', async () => {
    const service = new PersistentQueryStatusFilterService(makeContext());

    await service.setSectionVisible('Stopped', true);

    expect(service.isSectionVisible('Stopped')).toBe(true);
    expect(service.isVisible('Stopped')).toBe(true);
    expect(service.isVisible(null)).toBe(true);
  });

  it('leaves an unrecognized status alone when toggling a section', async () => {
    const service = new PersistentQueryStatusFilterService(makeContext([]));

    await service.setSectionVisible('Running', false);

    // Not part of either section's status list, so the toggle cannot hide it.
    expect(service.isVisible('Hibernating')).toBe(true);
  });

  it('persists a section toggle', async () => {
    const context = makeContext([]);
    const service = new PersistentQueryStatusFilterService(context);

    await service.setSectionVisible('Stopped', false);

    expect(context.globalState.update).toHaveBeenCalledWith(
      PERSISTENT_QUERY_HIDDEN_STATUSES_STORAGE_KEY,
      expect.arrayContaining(['Stopped', UNSET_QUERY_STATUS])
    );
  });
});
