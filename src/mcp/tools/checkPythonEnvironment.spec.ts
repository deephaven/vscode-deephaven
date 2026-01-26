import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCheckPythonEnvTool } from './checkPythonEnvironment';
import type { PipServerController } from '../../types';
import { McpToolResponse } from '../utils/mcpUtils';

vi.mock('vscode');

const MOCK_EXECUTION_TIME_MS = 100;

const EXPECTED_AVAILABLE = {
  success: true,
  message: 'Python environment is available',
  details: {
    isAvailable: true,
    interpreterPath: '/path/to/python',
  },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_NOT_AVAILABLE = {
  success: true,
  message: 'Python environment is not available',
  details: {
    isAvailable: false,
  },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_CONTROLLER_NOT_AVAILABLE = {
  success: false,
  message: 'PipServerController not available',
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_CHECK_ERROR = {
  success: false,
  message: 'Failed to check Python environment: Check failed',
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

describe('checkPythonEnvironment', () => {
  const mockPipServerController = {
    checkPipInstall: vi.fn(),
  } as unknown as PipServerController;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(McpToolResponse.prototype, 'getElapsedTimeMs').mockReturnValue(
      MOCK_EXECUTION_TIME_MS
    );
  });

  it('should return correct tool spec', () => {
    const tool = createCheckPythonEnvTool({
      pipServerController: mockPipServerController,
    });

    expect(tool.name).toBe('checkPythonEnvironment');
    expect(tool.spec.title).toBe('Check Python Environment');
    expect(tool.spec.description).toBe(
      'Check if the Python environment supports starting a Deephaven pip server.'
    );
  });

  it('should return error when pipServerController is null', async () => {
    const tool = createCheckPythonEnvTool({ pipServerController: null });
    const result = await tool.handler({});

    expect(result.structuredContent).toEqual(EXPECTED_CONTROLLER_NOT_AVAILABLE);
  });

  it('should return success when Python environment is available', async () => {
    vi.mocked(mockPipServerController.checkPipInstall).mockResolvedValue({
      isAvailable: true,
      interpreterPath: '/path/to/python',
    });

    const tool = createCheckPythonEnvTool({
      pipServerController: mockPipServerController,
    });
    const result = await tool.handler({});

    expect(mockPipServerController.checkPipInstall).toHaveBeenCalledOnce();
    expect(result.structuredContent).toEqual(EXPECTED_AVAILABLE);
  });

  it('should return success when Python environment is not available', async () => {
    vi.mocked(mockPipServerController.checkPipInstall).mockResolvedValue({
      isAvailable: false,
    });

    const tool = createCheckPythonEnvTool({
      pipServerController: mockPipServerController,
    });
    const result = await tool.handler({});

    expect(mockPipServerController.checkPipInstall).toHaveBeenCalledOnce();
    expect(result.structuredContent).toEqual(EXPECTED_NOT_AVAILABLE);
  });

  it('should handle errors from checkPipInstall', async () => {
    const error = new Error('Check failed');
    vi.mocked(mockPipServerController.checkPipInstall).mockRejectedValue(error);

    const tool = createCheckPythonEnvTool({
      pipServerController: mockPipServerController,
    });
    const result = await tool.handler({});

    expect(result.structuredContent).toEqual(EXPECTED_CHECK_ERROR);
  });
});
