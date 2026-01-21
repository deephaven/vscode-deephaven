import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRunCodeTool } from './runCode';
import type { IServerManager } from '../../types';

vi.mock('vscode');

describe('runCode tool', () => {
  let serverManager: IServerManager;

  beforeEach(() => {
    vi.clearAllMocks();

    serverManager = {
      getConnections: vi.fn(),
      getServer: vi.fn(),
    } as unknown as IServerManager;
  });

  describe('spec', () => {
    it('should have correct spec', () => {
      const tool = createRunCodeTool({ serverManager });
      expect(tool.name).toBe('runCode');
      expect(tool.spec.title).toBe('Run Deephaven Code');
      expect(tool.spec.description).toBe(
        'Execute arbitrary code text in a Deephaven session. Use this for ad-hoc script execution. For running code from workspace files, use runCodeFromUri instead.'
      );
    });
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
        executionTimeMs: expect.any(Number),
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
        executionTimeMs: expect.any(Number),
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
        executionTimeMs: expect.any(Number),
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
        executionTimeMs: expect.any(Number),
      });
    });
  });
});
