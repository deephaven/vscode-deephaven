import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { createOpenFilesInEditorTool } from './openFilesInEditor';
import { McpToolResponse } from '../utils/mcpUtils';

vi.mock('vscode');

const MOCK_EXECUTION_TIME_MS = 100;

const MOCK_FILE_URIS = [
  'file:///path/to/file1.py',
  'dh://server/file2.groovy',
  'file:///path/to/file3.txt',
];

const EXPECTED_SUCCESS = {
  success: true,
  message: 'Files opened in editor successfully',
  details: { filesOpened: 3 },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_ERROR = {
  success: false,
  message: 'Failed to open some files',
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
  details: {
    filesOpened: 0,
    failedUris: MOCK_FILE_URIS,
  },
} as const;

describe('openFilesInEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(McpToolResponse.prototype, 'getElapsedTimeMs').mockReturnValue(
      MOCK_EXECUTION_TIME_MS
    );

    vi.mocked(vscode.window.showTextDocument).mockResolvedValue(
      {} as vscode.TextEditor
    );
  });

  it('should return correct tool spec', () => {
    const tool = createOpenFilesInEditorTool();

    expect(tool.name).toBe('openFilesInEditor');
    expect(tool.spec.title).toBe('Open Files in Editor');
    expect(tool.spec.description).toBe(
      'Open one or more files in the VS Code editor.'
    );
  });

  it('should open files with default options', async () => {
    const tool = createOpenFilesInEditorTool();
    const result = await tool.handler({ uris: MOCK_FILE_URIS });

    expect(vscode.Uri.parse).toHaveBeenCalledTimes(3);
    expect(vscode.window.showTextDocument).toHaveBeenCalledTimes(3);
    expect(vscode.window.showTextDocument).toHaveBeenCalledWith(
      expect.anything(),
      { preview: true, preserveFocus: false }
    );

    expect(result.structuredContent).toEqual(EXPECTED_SUCCESS);
  });

  it('should open files with preview disabled', async () => {
    const tool = createOpenFilesInEditorTool();
    const result = await tool.handler({
      uris: MOCK_FILE_URIS,
      preview: false,
    });

    expect(vscode.window.showTextDocument).toHaveBeenCalledWith(
      expect.anything(),
      { preview: false, preserveFocus: false }
    );

    expect(result.structuredContent).toEqual(EXPECTED_SUCCESS);
  });

  it('should open files with preserveFocus enabled', async () => {
    const tool = createOpenFilesInEditorTool();
    const result = await tool.handler({
      uris: MOCK_FILE_URIS,
      preserveFocus: true,
    });

    expect(vscode.window.showTextDocument).toHaveBeenCalledWith(
      expect.anything(),
      { preview: true, preserveFocus: true }
    );

    expect(result.structuredContent).toEqual(EXPECTED_SUCCESS);
  });

  it('should open files with custom options', async () => {
    const tool = createOpenFilesInEditorTool();
    const result = await tool.handler({
      uris: MOCK_FILE_URIS,
      preview: false,
      preserveFocus: true,
    });

    expect(vscode.window.showTextDocument).toHaveBeenCalledWith(
      expect.anything(),
      { preview: false, preserveFocus: true }
    );

    expect(result.structuredContent).toEqual(EXPECTED_SUCCESS);
  });

  it('should handle single file', async () => {
    const tool = createOpenFilesInEditorTool();
    const result = await tool.handler({ uris: ['file:///path/to/file.py'] });

    expect(vscode.window.showTextDocument).toHaveBeenCalledTimes(1);
    expect(result.structuredContent).toEqual({
      success: true,
      message: 'Files opened in editor successfully',
      details: { filesOpened: 1 },
      executionTimeMs: MOCK_EXECUTION_TIME_MS,
    });
  });

  it('should handle empty array', async () => {
    const tool = createOpenFilesInEditorTool();
    const result = await tool.handler({ uris: [] });

    expect(vscode.window.showTextDocument).not.toHaveBeenCalled();
    expect(result.structuredContent).toEqual({
      success: true,
      message: 'Files opened in editor successfully',
      details: { filesOpened: 0 },
      executionTimeMs: MOCK_EXECUTION_TIME_MS,
    });
  });

  it('should handle showTextDocument error', async () => {
    const error = new Error('Failed to open document');
    vi.mocked(vscode.window.showTextDocument).mockRejectedValue(error);

    const tool = createOpenFilesInEditorTool();
    const result = await tool.handler({ uris: MOCK_FILE_URIS });

    expect(result.structuredContent).toEqual(EXPECTED_ERROR);
  });

  it('should handle URI parsing error', async () => {
    const error = new Error('Invalid URI');
    vi.mocked(vscode.Uri.parse).mockImplementation(() => {
      throw error;
    });

    const tool = createOpenFilesInEditorTool();
    const result = await tool.handler({ uris: MOCK_FILE_URIS });

    expect(result.structuredContent).toEqual({
      success: false,
      message: 'Failed to open some files',
      executionTimeMs: MOCK_EXECUTION_TIME_MS,
      details: {
        filesOpened: 0,
        failedUris: MOCK_FILE_URIS,
      },
    });
  });
});
