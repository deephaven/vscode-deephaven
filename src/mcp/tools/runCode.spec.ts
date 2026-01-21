import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRunCodeTool } from './runCode';
import type { IServerManager } from '../../types';
import { McpToolResponse } from '../utils/mcpUtils';

vi.mock('vscode');

const MOCK_EXECUTION_TIME_MS = 100;

describe('runCode tool', () => {
  let serverManager: IServerManager;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock getElapsedTimeMs to return a fixed value
    vi.spyOn(McpToolResponse.prototype, 'getElapsedTimeMs').mockReturnValue(
      MOCK_EXECUTION_TIME_MS
    );

    serverManager = {
      getConnections: vi.fn(),
      getServer: vi.fn(),
    } as unknown as IServerManager;
  });

  it('should have correct spec', () => {
    const tool = createRunCodeTool({ serverManager });
    expect(tool.name).toBe('runCode');
    expect(tool.spec.title).toBe('Run Deephaven Code');
    expect(tool.spec.description).toBe(
      'Execute arbitrary code text in a Deephaven session. Use this for ad-hoc script execution. For running code from workspace files, use runCodeFromUri instead.'
    );
  });

  describe('input validation', () => {
    it('should reject invalid languageId', async () => {
      const tool = createRunCodeTool({ serverManager });
      const result = await tool.handler({
        code: 'print("test")',
        languageId: 'javascript',
        connectionUrl: 'http://localhost:10000',
      });

      expect(result.structuredContent).toEqual({
        success: false,
        message: `Invalid languageId: 'javascript'. Must be "python" or "groovy".`,
        executionTimeMs: MOCK_EXECUTION_TIME_MS,
      });
      expect(serverManager.getConnections).not.toHaveBeenCalled();
    });

    it.each([
      ['python', 'print("test")'],
      ['groovy', 'println "test"'],
    ])('should accept %s languageId', async (languageId, code) => {
      vi.mocked(serverManager.getConnections).mockReturnValue([]);
      vi.mocked(serverManager.getServer).mockReturnValue(undefined);

      const tool = createRunCodeTool({ serverManager });
      await tool.handler({
        code,
        languageId,
        connectionUrl: 'http://localhost:10000',
      });

      // Should get past validation and attempt to get connections
      expect(serverManager.getConnections).toHaveBeenCalled();
    });

    it('should reject invalid URL', async () => {
      const tool = createRunCodeTool({ serverManager });
      const result = await tool.handler({
        code: 'print("test")',
        languageId: 'python',
        connectionUrl: 'not-a-url',
      });

      expect(result.structuredContent).toEqual({
        success: false,
        message: 'Invalid URL: Invalid URL',
        details: { connectionUrl: 'not-a-url' },
        executionTimeMs: MOCK_EXECUTION_TIME_MS,
      });
      expect(serverManager.getConnections).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should provide hint when no connections found', async () => {
      vi.mocked(serverManager.getConnections).mockReturnValue([]);
      vi.mocked(serverManager.getServer).mockReturnValue(undefined);

      const tool = createRunCodeTool({ serverManager });
      const result = await tool.handler({
        code: 'print("test")',
        languageId: 'python',
        connectionUrl: 'http://localhost:10000',
      });

      expect(result.structuredContent).toEqual({
        success: false,
        message: 'No connections or server found',
        details: { connectionUrl: 'http://localhost:10000' },
        hint: expect.any(String),
        executionTimeMs: MOCK_EXECUTION_TIME_MS,
      });
    });

    it('should handle exceptions during execution', async () => {
      const error = new Error('Unexpected error');
      vi.mocked(serverManager.getConnections).mockImplementation(() => {
        throw error;
      });

      const tool = createRunCodeTool({ serverManager });
      const result = await tool.handler({
        code: 'print("test")',
        languageId: 'python',
        connectionUrl: 'http://localhost:10000',
      });

      expect(result.structuredContent).toEqual({
        success: false,
        message: 'Failed to execute code: Unexpected error',
        details: { languageId: 'python' },
        executionTimeMs: MOCK_EXECUTION_TIME_MS,
      });
    });
  });
});
