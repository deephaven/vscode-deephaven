import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutputChannelWithHistory } from '../../util';
import { createGetLogsTool } from './getLogs';
import { McpToolResponse } from '../utils/mcpUtils';

vi.mock('vscode');

const MOCK_EXECUTION_TIME_MS = 100;

const MOCK_LOG_HISTORY = [
  '2024-01-01 10:00:00 [INFO] Server started',
  '2024-01-01 10:00:01 [DEBUG] Connection established',
  '2024-01-01 10:00:02 [INFO] Query executed',
];

const EXPECTED_SUCCESS = {
  success: true,
  message: 'Retrieved log history',
  details: {
    logs: MOCK_LOG_HISTORY.join('\n'),
  },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_EMPTY_LOGS = {
  success: true,
  message: 'Retrieved log history',
  details: {
    logs: '',
  },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_GET_HISTORY_ERROR = {
  success: false,
  message: 'Failed to retrieve logs: getHistory error',
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

describe('getLogs', () => {
  const outputChannelDebug = {
    getHistory: vi.fn(),
  } as unknown as OutputChannelWithHistory;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(McpToolResponse.prototype, 'getElapsedTimeMs').mockReturnValue(
      MOCK_EXECUTION_TIME_MS
    );
  });

  it('should return correct tool spec', () => {
    const tool = createGetLogsTool({ outputChannelDebug });

    expect(tool.name).toBe('getLogs');
    expect(tool.spec.title).toBe('Get Logs');
    expect(tool.spec.description).toBe(
      'Get the log history from the Deephaven debug output channel. Returns all accumulated log messages.'
    );
  });

  it('should retrieve and return log history', async () => {
    vi.mocked(outputChannelDebug.getHistory).mockReturnValue(MOCK_LOG_HISTORY);

    const tool = createGetLogsTool({ outputChannelDebug });
    const result = await tool.handler({});

    expect(outputChannelDebug.getHistory).toHaveBeenCalledOnce();
    expect(result.structuredContent).toEqual(EXPECTED_SUCCESS);
  });

  it('should handle empty log history', async () => {
    vi.mocked(outputChannelDebug.getHistory).mockReturnValue([]);

    const tool = createGetLogsTool({ outputChannelDebug });
    const result = await tool.handler({});

    expect(outputChannelDebug.getHistory).toHaveBeenCalledOnce();
    expect(result.structuredContent).toEqual(EXPECTED_EMPTY_LOGS);
  });

  it('should handle errors from getHistory', async () => {
    const error = new Error('getHistory error');
    vi.mocked(outputChannelDebug.getHistory).mockImplementation(() => {
      throw error;
    });

    const tool = createGetLogsTool({ outputChannelDebug });
    const result = await tool.handler({});

    expect(result.structuredContent).toEqual(EXPECTED_GET_HISTORY_ERROR);
  });
});
