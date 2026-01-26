import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStartPipServerTool } from './startPipServer';
import type { PipServerController } from '../../types';
import { McpToolResponse } from '../utils/mcpUtils';

vi.mock('vscode');

const MOCK_EXECUTION_TIME_MS = 100;

const EXPECTED_SUCCESS = {
  success: true,
  message: 'Pip server started successfully',
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_CONTROLLER_NOT_AVAILABLE = {
  success: false,
  message: 'PipServerController not available',
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_ENV_NOT_AVAILABLE = {
  success: false,
  message: 'Python environment is not available',
  hint: 'Install the deephaven-server package with: pip install deephaven-server',
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_START_ERROR = {
  success: false,
  message: 'Failed to start pip server: Start failed',
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

describe('startPipServer', () => {
  const mockPipServerController = {
    checkPipInstall: vi.fn(),
    startServer: vi.fn(),
  } as unknown as PipServerController;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(McpToolResponse.prototype, 'getElapsedTimeMs').mockReturnValue(
      MOCK_EXECUTION_TIME_MS
    );
  });

  it('should return correct tool spec', () => {
    const tool = createStartPipServerTool({
      pipServerController: mockPipServerController,
    });

    expect(tool.name).toBe('startPipServer');
    expect(tool.spec.title).toBe('Start Pip Server');
    expect(tool.spec.description).toBe(
      'Start a managed Deephaven pip server if the environment supports it.'
    );
  });

  it('should return error when pipServerController is null', async () => {
    const tool = createStartPipServerTool({ pipServerController: null });
    const result = await tool.handler({});

    expect(result.structuredContent).toEqual(EXPECTED_CONTROLLER_NOT_AVAILABLE);
  });

  it('should return error with hint when Python environment is not available', async () => {
    vi.mocked(mockPipServerController.checkPipInstall).mockResolvedValue({
      isAvailable: false,
    });

    const tool = createStartPipServerTool({
      pipServerController: mockPipServerController,
    });
    const result = await tool.handler({});

    expect(mockPipServerController.checkPipInstall).toHaveBeenCalledOnce();
    expect(mockPipServerController.startServer).not.toHaveBeenCalled();
    expect(result.structuredContent).toEqual(EXPECTED_ENV_NOT_AVAILABLE);
  });

  it('should successfully start pip server when environment is available', async () => {
    vi.mocked(mockPipServerController.checkPipInstall).mockResolvedValue({
      isAvailable: true,
      interpreterPath: '/path/to/python',
    });
    vi.mocked(mockPipServerController.startServer).mockResolvedValue(undefined);

    const tool = createStartPipServerTool({
      pipServerController: mockPipServerController,
    });
    const result = await tool.handler({});

    expect(mockPipServerController.checkPipInstall).toHaveBeenCalledOnce();
    expect(mockPipServerController.startServer).toHaveBeenCalledOnce();
    expect(result.structuredContent).toEqual(EXPECTED_SUCCESS);
  });

  it('should handle errors from startServer', async () => {
    vi.mocked(mockPipServerController.checkPipInstall).mockResolvedValue({
      isAvailable: true,
      interpreterPath: '/path/to/python',
    });
    const error = new Error('Start failed');
    vi.mocked(mockPipServerController.startServer).mockRejectedValue(error);

    const tool = createStartPipServerTool({
      pipServerController: mockPipServerController,
    });
    const result = await tool.handler({});

    expect(result.structuredContent).toEqual(EXPECTED_START_ERROR);
  });
});
