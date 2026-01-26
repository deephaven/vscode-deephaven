import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutputChannelWithHistory } from '../../util';
import { createShowOutputPanelTool } from './showOutputPanel';
import { McpToolResponse } from '../utils/mcpUtils';

vi.mock('vscode');

const MOCK_EXECUTION_TIME_MS = 100;

const EXPECTED_OUTPUT_SUCCESS = {
  success: true,
  message: 'Output panel shown',
  details: {
    channel: 'output',
  },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_DEBUG_SUCCESS = {
  success: true,
  message: 'Output panel shown',
  details: {
    channel: 'debug',
  },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_OUTPUT_ERROR = {
  success: false,
  message: 'Failed to show output panel: show error',
  details: {
    channel: 'output',
  },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_DEBUG_ERROR = {
  success: false,
  message: 'Failed to show output panel: show error',
  details: {
    channel: 'debug',
  },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

describe('showOutputPanel', () => {
  const outputChannel = {
    show: vi.fn(),
  } as unknown as vscode.OutputChannel;

  const outputChannelDebug = {
    show: vi.fn(),
  } as unknown as OutputChannelWithHistory;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(McpToolResponse.prototype, 'getElapsedTimeMs').mockReturnValue(
      MOCK_EXECUTION_TIME_MS
    );
  });

  it('should return correct tool spec', () => {
    const tool = createShowOutputPanelTool({
      outputChannel,
      outputChannelDebug,
    });

    expect(tool.name).toBe('showOutputPanel');
    expect(tool.spec.title).toBe('Show Output Panel');
    expect(tool.spec.description).toBe(
      'Show a Deephaven output panel in the VS Code UI. Can show either the regular output channel or debug channel.'
    );
  });

  it('should show output channel when channel is "output"', async () => {
    const tool = createShowOutputPanelTool({
      outputChannel,
      outputChannelDebug,
    });
    const result = await tool.handler({ channel: 'output' });

    expect(outputChannel.show).toHaveBeenCalledWith(true);
    expect(outputChannelDebug.show).not.toHaveBeenCalled();
    expect(result.structuredContent).toEqual(EXPECTED_OUTPUT_SUCCESS);
  });

  it('should show debug channel when channel is "debug"', async () => {
    const tool = createShowOutputPanelTool({
      outputChannel,
      outputChannelDebug,
    });
    const result = await tool.handler({ channel: 'debug' });

    expect(outputChannelDebug.show).toHaveBeenCalledWith(true);
    expect(outputChannel.show).not.toHaveBeenCalled();
    expect(result.structuredContent).toEqual(EXPECTED_DEBUG_SUCCESS);
  });

  it('should default to output channel when no channel specified', async () => {
    const tool = createShowOutputPanelTool({
      outputChannel,
      outputChannelDebug,
    });
    const result = await tool.handler({});

    expect(outputChannel.show).toHaveBeenCalledWith(true);
    expect(outputChannelDebug.show).not.toHaveBeenCalled();
    expect(result.structuredContent).toEqual(EXPECTED_OUTPUT_SUCCESS);
  });

  it('should handle errors from output channel', async () => {
    const error = new Error('show error');
    vi.mocked(outputChannel.show).mockImplementation(() => {
      throw error;
    });

    const tool = createShowOutputPanelTool({
      outputChannel,
      outputChannelDebug,
    });
    const result = await tool.handler({ channel: 'output' });

    expect(result.structuredContent).toEqual(EXPECTED_OUTPUT_ERROR);
  });

  it('should handle errors from debug channel', async () => {
    const error = new Error('show error');
    vi.mocked(outputChannelDebug.show).mockImplementation(() => {
      throw error;
    });

    const tool = createShowOutputPanelTool({
      outputChannel,
      outputChannelDebug,
    });
    const result = await tool.handler({ channel: 'debug' });

    expect(result.structuredContent).toEqual(EXPECTED_DEBUG_ERROR);
  });
});
