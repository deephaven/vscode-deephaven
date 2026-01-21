import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createListConnectionsTool } from './listConnections';
import type { IServerManager, ConnectionState } from '../../types';
import * as util from '../../util';
import { McpToolResponse } from '../utils/mcpUtils';

vi.mock('vscode');
vi.mock('../../util', async importOriginal => {
  const actual = await importOriginal<typeof import('../../util')>();
  return {
    ...actual,
    parseUrl: vi.fn(),
  };
});

const MOCK_CONNECTIONS: ConnectionState[] = [
  {
    serverUrl: new URL('http://localhost:10000'),
    isConnected: true,
    isRunningCode: false,
    tagId: 'conn1',
  },
  {
    serverUrl: new URL('http://localhost:10001'),
    isConnected: true,
    isRunningCode: true,
    tagId: 'conn2',
  },
] as ConnectionState[];

const MOCK_EXECUTION_TIME_MS = 100;

describe('listConnections', () => {
  let serverManager: IServerManager;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock getElapsedTimeMs to return a fixed value
    vi.spyOn(McpToolResponse.prototype, 'getElapsedTimeMs').mockReturnValue(
      MOCK_EXECUTION_TIME_MS
    );

    // Mock parseUrl to return successful results by default
    vi.mocked(util.parseUrl).mockImplementation(url => {
      if (!url) {
        return { success: true, value: null };
      }
      if (url === 'invalid-url') {
        return { success: false, error: 'Invalid URL' };
      }
      return { success: true, value: new URL(url) };
    });

    serverManager = {
      getConnections: vi.fn(),
    } as unknown as IServerManager;
  });

  it('should return correct tool spec', () => {
    const tool = createListConnectionsTool({ serverManager });

    expect(tool.name).toBe('listConnections');
    expect(tool.spec.title).toBe('List Connections');
    expect(tool.spec.description).toBe(
      'List all active Deephaven connections, optionally filtered by server URL.'
    );
  });

  describe('handler', () => {
    it('should call getConnections with undefined when no serverUrl is provided', async () => {
      vi.mocked(serverManager.getConnections).mockReturnValue(MOCK_CONNECTIONS);

      const tool = createListConnectionsTool({ serverManager });
      const result = await tool.handler({});

      expect(serverManager.getConnections).toHaveBeenCalledWith(undefined);
      expect(result.structuredContent).toEqual({
        success: true,
        message: 'Found 2 connection(s)',
        details: {
          connections: MOCK_CONNECTIONS.map(c => ({
            ...c,
            serverUrl: c.serverUrl.toString(),
          })),
        },
        executionTimeMs: MOCK_EXECUTION_TIME_MS,
      });
    });

    it('should filter connections by serverUrl', async () => {
      const filteredConnections = [MOCK_CONNECTIONS[0]];
      vi.mocked(serverManager.getConnections).mockReturnValue(
        filteredConnections
      );

      const tool = createListConnectionsTool({ serverManager });
      const result = await tool.handler({
        serverUrl: 'http://localhost:10000',
      });

      expect(serverManager.getConnections).toHaveBeenCalledWith(
        new URL('http://localhost:10000')
      );
      expect(result.structuredContent).toEqual({
        success: true,
        message: 'Found 1 connection(s)',
        details: {
          connections: filteredConnections.map(c => ({
            ...c,
            serverUrl: c.serverUrl.toString(),
          })),
        },
        executionTimeMs: MOCK_EXECUTION_TIME_MS,
      });
    });

    it('should return empty list when no connections exist', async () => {
      vi.mocked(serverManager.getConnections).mockReturnValue([]);

      const tool = createListConnectionsTool({ serverManager });
      const result = await tool.handler({});

      expect(result.structuredContent).toEqual({
        success: true,
        message: 'Found 0 connection(s)',
        details: {
          connections: [],
        },
        executionTimeMs: MOCK_EXECUTION_TIME_MS,
      });
    });

    it('should handle invalid URL', async () => {
      const tool = createListConnectionsTool({ serverManager });
      const result = await tool.handler({ serverUrl: 'invalid-url' });

      expect(result.structuredContent).toEqual({
        success: false,
        message: 'Invalid URL: Invalid URL',
        details: { serverUrl: 'invalid-url' },
        executionTimeMs: MOCK_EXECUTION_TIME_MS,
      });
      expect(serverManager.getConnections).not.toHaveBeenCalled();
    });

    it('should handle errors from serverManager', async () => {
      const error = new Error('Connection error');
      vi.mocked(serverManager.getConnections).mockImplementation(() => {
        throw error;
      });

      const tool = createListConnectionsTool({ serverManager });
      const result = await tool.handler({});

      expect(result.structuredContent).toEqual({
        success: false,
        message: 'Failed to list connections: Connection error',
        executionTimeMs: MOCK_EXECUTION_TIME_MS,
      });
    });
  });
});
