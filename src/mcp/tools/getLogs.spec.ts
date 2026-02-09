import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutputChannelWithHistory } from '../../util';
import { createGetLogsTool } from './getLogs';
import {
  fakeMcpToolTimings,
  mcpErrorResult,
  mcpSuccessResult,
} from '../utils/mcpTestUtils';

vi.mock('vscode');

const MOCK_LOG_HISTORY = [
  '2024-01-01 10:00:00 [INFO] Server started',
  '2024-01-01 10:00:01 [DEBUG] Connection established',
  '2024-01-01 10:00:02 [INFO] Query executed',
];

describe('getLogs', () => {
  const outputChannel = {
    getHistory: vi.fn(),
  } as unknown as OutputChannelWithHistory;

  const outputChannelDebug = {
    getHistory: vi.fn(),
  } as unknown as OutputChannelWithHistory;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeMcpToolTimings();
  });

  it('should return correct tool spec', () => {
    const tool = createGetLogsTool({ outputChannel, outputChannelDebug });

    expect(tool.name).toBe('getLogs');
    expect(tool.spec.title).toBe('Get Logs');
    expect(tool.spec.description).toBe(
      'Get the log history from the Deephaven output. Returns all accumulated log messages.'
    );
  });

  it.each([{ logType: 'server' as const }, { logType: 'debug' as const }])(
    'should retrieve and return log history for logType "$logType"',
    async ({ logType }) => {
      const channel = logType === 'server' ? outputChannel : outputChannelDebug;
      vi.mocked(channel.getHistory).mockReturnValue(MOCK_LOG_HISTORY);

      const tool = createGetLogsTool({ outputChannel, outputChannelDebug });
      const result = await tool.handler({ logType });

      expect(channel.getHistory).toHaveBeenCalledOnce();
      expect(result.structuredContent).toEqual(
        mcpSuccessResult('Retrieved log history', {
          logs: MOCK_LOG_HISTORY,
          logType,
        })
      );
    }
  );

  it.each([{ logType: 'server' as const }, { logType: 'debug' as const }])(
    'should handle empty log history for logType "$logType"',
    async ({ logType }) => {
      const channel = logType === 'server' ? outputChannel : outputChannelDebug;
      vi.mocked(channel.getHistory).mockReturnValue([]);

      const tool = createGetLogsTool({ outputChannel, outputChannelDebug });
      const result = await tool.handler({ logType });

      expect(channel.getHistory).toHaveBeenCalledOnce();
      expect(result.structuredContent).toEqual(
        mcpSuccessResult('Retrieved log history', {
          logs: [],
          logType,
        })
      );
    }
  );

  it.each([{ logType: 'server' as const }, { logType: 'debug' as const }])(
    'should handle errors from getHistory for logType "$logType"',
    async ({ logType }) => {
      const channel = logType === 'server' ? outputChannel : outputChannelDebug;
      const error = new Error('getHistory error');
      vi.mocked(channel.getHistory).mockImplementation(() => {
        throw error;
      });

      const tool = createGetLogsTool({ outputChannel, outputChannelDebug });
      const result = await tool.handler({ logType });

      expect(result.structuredContent).toEqual(
        mcpErrorResult('Failed to retrieve logs: getHistory error', {
          logType,
        })
      );
    }
  );
});
