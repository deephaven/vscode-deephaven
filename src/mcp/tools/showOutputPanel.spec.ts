import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutputChannelWithHistory } from '../../util';
import { createShowOutputPanelTool } from './showOutputPanel';
import {
  fakeMcpToolTimings,
  mcpErrorResult,
  mcpSuccessResult,
} from '../utils/mcpTestUtils';

vi.mock('vscode');

describe('showOutputPanel', () => {
  const outputChannel = {
    show: vi.fn(),
  } as unknown as OutputChannelWithHistory;

  const outputChannelDebug = {
    show: vi.fn(),
  } as unknown as OutputChannelWithHistory;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeMcpToolTimings();
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
      expect(result.structuredContent).toEqual(
        mcpSuccessResult('Output panel shown', { outputType })
      );
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

      expect(result.structuredContent).toEqual(
        mcpErrorResult('Failed to show output panel: show error', {
          outputType,
        })
      );
    }
  );
});
