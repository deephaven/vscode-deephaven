import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutputChannelWithHistory } from '../../util';
import { createShowOutputPanelTool } from './showOutputPanel';
import { McpToolResponse } from '../utils/mcpUtils';

vi.mock('vscode');

const MOCK_EXECUTION_TIME_MS = 100;

describe('showOutputPanel', () => {
  const outputChannel = {
    show: vi.fn(),
  } as unknown as OutputChannelWithHistory;

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
      'Show a Deephaven output panel in the VS Code UI. Can show either the server output or debug output.'
    );
  });

  it.each([
    { outputType: 'server' as const },
    { outputType: 'debug' as const },
  ])(
    'should show correct channel when outputType is "$outputType"',
    async ({ outputType }) => {
      const tool = createShowOutputPanelTool({
        outputChannel,
        outputChannelDebug,
      });
      const result = await tool.handler({ outputType });

      const channelToShow =
        outputType === 'server' ? outputChannel : outputChannelDebug;
      const channelNotToShow =
        outputType === 'server' ? outputChannelDebug : outputChannel;

      expect(channelToShow.show).toHaveBeenCalledWith(true);
      expect(channelNotToShow.show).not.toHaveBeenCalled();
      expect(result.structuredContent).toEqual({
        success: true,
        message: 'Output panel shown',
        details: {
          outputType,
        },
        executionTimeMs: MOCK_EXECUTION_TIME_MS,
      });
    }
  );

  it.each([
    { outputType: 'server' as const },
    { outputType: 'debug' as const },
  ])(
    'should handle errors for outputType "$outputType"',
    async ({ outputType }) => {
      const error = new Error('show error');
      const channelWithError =
        outputType === 'server' ? outputChannel : outputChannelDebug;

      vi.mocked(channelWithError.show).mockImplementation(() => {
        throw error;
      });

      const tool = createShowOutputPanelTool({
        outputChannel,
        outputChannelDebug,
      });
      const result = await tool.handler({ outputType });

      expect(result.structuredContent).toEqual({
        success: false,
        message: 'Failed to show output panel: show error',
        details: {
          outputType,
        },
        executionTimeMs: MOCK_EXECUTION_TIME_MS,
      });
    }
  );
});
