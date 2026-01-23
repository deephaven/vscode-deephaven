import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createListServersTool } from './listServers';
import type { IServerManager, ServerState, ConnectionState } from '../../types';
import { McpToolResponse } from '../utils/mcpUtils';
import type { ServerResult } from '../utils/serverUtils';
import * as serverUtils from '../utils/serverUtils';

vi.mock('vscode');
vi.mock('../utils/serverUtils', async () => {
  const actual = await vi.importActual<typeof serverUtils>(
    '../utils/serverUtils'
  );
  return {
    ...actual,
    serverToResult: vi.fn(),
  };
});

const MOCK_EXECUTION_TIME_MS = 100;

const MOCK_SERVER_RESULT1 = { label: 'mock server 1' } as ServerResult;
const MOCK_SERVER_RESULT2 = { label: 'mock server 2' } as ServerResult;
const MOCK_SERVER1 = { url: new URL('http://server1') } as ServerState;
const MOCK_SERVER2 = { url: new URL('http://server2') } as ServerState;
const MOCK_CONNECTION1 = {
  serverUrl: new URL('http://conn1'),
} as ConnectionState;
const MOCK_CONNECTION2 = {
  serverUrl: new URL('http://conn2'),
} as ConnectionState;

describe('createListServersTool', () => {
  const serverManager: IServerManager = {
    getServers: vi.fn(),
    getConnections: vi.fn(),
  } as unknown as IServerManager;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(McpToolResponse.prototype, 'getElapsedTimeMs').mockReturnValue(
      MOCK_EXECUTION_TIME_MS
    );

    vi.mocked(serverManager.getServers).mockReturnValue([
      MOCK_SERVER1,
      MOCK_SERVER2,
    ]);
    vi.mocked(serverManager.getConnections)
      .mockReturnValueOnce([MOCK_CONNECTION1])
      .mockReturnValueOnce([MOCK_CONNECTION2]);
    vi.mocked(serverUtils.serverToResult)
      .mockReturnValueOnce(MOCK_SERVER_RESULT1)
      .mockReturnValueOnce(MOCK_SERVER_RESULT2);
  });

  it('should create tool with correct name and spec', () => {
    const tool = createListServersTool({ serverManager });

    expect(tool.name).toBe('listServers');
    expect(tool.spec.title).toBe('List Servers');
    expect(tool.spec.description).toContain('List all Deephaven servers');
  });

  describe('handler', () => {
    it('should call serverToResult for each server with connections', async () => {
      const tool = createListServersTool({ serverManager });
      const result = await tool.handler({});

      expect(serverManager.getServers).toHaveBeenCalledWith({});
      expect(serverManager.getConnections).toHaveBeenCalledWith(
        MOCK_SERVER1.url
      );
      expect(serverManager.getConnections).toHaveBeenCalledWith(
        MOCK_SERVER2.url
      );
      expect(serverUtils.serverToResult).toHaveBeenCalledWith(MOCK_SERVER1, [
        MOCK_CONNECTION1,
      ]);
      expect(serverUtils.serverToResult).toHaveBeenCalledWith(MOCK_SERVER2, [
        MOCK_CONNECTION2,
      ]);

      const expected = {
        success: true,
        message: 'Found 2 server(s)',
        executionTimeMs: MOCK_EXECUTION_TIME_MS,
        details: {
          servers: [MOCK_SERVER_RESULT1, MOCK_SERVER_RESULT2],
        },
      };

      expect(result.structuredContent).toEqual(expected);
    });

    it('should pass filters to serverManager.getServers', async () => {
      const filters = { isRunning: true, type: 'DHC' as const };

      const tool = createListServersTool({ serverManager });
      await tool.handler(filters);

      expect(serverManager.getServers).toHaveBeenCalledWith(filters);
    });

    it('should handle empty server list', async () => {
      vi.mocked(serverManager.getServers).mockReturnValue([]);

      const tool = createListServersTool({ serverManager });
      const result = await tool.handler({});

      expect(serverUtils.serverToResult).not.toHaveBeenCalled();

      const expected = {
        success: true,
        message: 'Found 0 server(s)',
        executionTimeMs: MOCK_EXECUTION_TIME_MS,
        details: {
          servers: [],
        },
      };

      expect(result.structuredContent).toEqual(expected);
    });

    it('should handle errors from serverManager', async () => {
      const error = new Error('Mock error object');
      vi.mocked(serverManager.getServers).mockImplementation(() => {
        throw error;
      });

      const tool = createListServersTool({ serverManager });
      const result = await tool.handler({});

      const expected = {
        success: false,
        message: 'Failed to list servers: Mock error object',
        executionTimeMs: MOCK_EXECUTION_TIME_MS,
      };

      expect(result.structuredContent).toEqual(expected);
    });
  });
});
