import { describe, it, expect } from 'vitest';
import { getServerContextValue } from './serverUtils';
import { SERVER_TREE_ITEM_CONTEXT } from '../common';

describe('getServerContextValue', () => {
  it.each([
    [true, true, true, SERVER_TREE_ITEM_CONTEXT.isManagedServerConnected],
    [true, true, false, SERVER_TREE_ITEM_CONTEXT.isManagedServerConnected],
    [true, false, true, SERVER_TREE_ITEM_CONTEXT.isServerRunningConnected],
    [true, false, false, SERVER_TREE_ITEM_CONTEXT.isServerStopped],
    [false, true, true, SERVER_TREE_ITEM_CONTEXT.isManagedServerDisconnected],
    [false, true, false, SERVER_TREE_ITEM_CONTEXT.isManagedServerConnecting],
    [false, false, true, SERVER_TREE_ITEM_CONTEXT.isServerRunningDisconnected],
    [false, false, false, SERVER_TREE_ITEM_CONTEXT.isServerStopped],
  ])(
    'should return contextValue based on server state: isConnected=%s, isManaged=%s, isRunning=%s',
    (isConnected, isManaged, isRunning, expected) => {
      const actual = getServerContextValue({
        isConnected,
        isManaged,
        isRunning,
      });

      expect(actual).toEqual(expected);
    }
  );
});
