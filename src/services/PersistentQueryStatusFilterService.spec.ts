import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as vscode from 'vscode';
import { PersistentQueryStatusFilterService } from './PersistentQueryStatusFilterService';
import {
  DEFAULT_HIDDEN_QUERY_STATUSES,
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
    it('hides the terminal + unset statuses on first run', () => {
      const service = new PersistentQueryStatusFilterService(makeContext());

      expect([...service.getHiddenStatuses()].sort()).toEqual(
        [...DEFAULT_HIDDEN_QUERY_STATUSES].sort()
      );
      expect(service.isVisible('Running')).toBe(true);
      expect(service.isVisible('Initializing')).toBe(true);
      expect(service.isVisible('Stopped')).toBe(false);
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
