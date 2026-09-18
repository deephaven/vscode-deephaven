import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { dh as DhType } from '@deephaven/jsapi-types';
import { subscribeToColumns } from './dhc';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

describe('subscribeToColumns', () => {
  const columns = [{ name: 'Serial' }] as unknown as DhType.Column[];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses createSubscription when the server API provides it', () => {
    const expected = {} as DhType.TableSubscription;
    const createSubscription = vi.fn(() => expected);
    const subscribe = vi.fn();
    const table = {
      createSubscription,
      subscribe,
    } as unknown as DhType.Table;

    expect(subscribeToColumns(table, columns)).toBe(expected);
    expect(createSubscription).toHaveBeenCalledExactlyOnceWith({ columns });
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('falls back to the deprecated subscribe if subscribeToColumns not defined', () => {
    const expected = {} as DhType.TableSubscription;
    const subscribe = vi.fn(() => expected);
    // An older worker's API simply has no such property, despite the bundled
    // types declaring one.
    const table = { subscribe } as unknown as DhType.Table;

    expect(subscribeToColumns(table, columns)).toBe(expected);
    expect(subscribe).toHaveBeenCalledExactlyOnceWith(columns);
  });
});
