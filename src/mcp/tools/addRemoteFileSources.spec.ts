import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { createAddRemoteFileSourcesTool } from './addRemoteFileSources';
import { McpToolResponse } from '../utils/mcpUtils';
import { ADD_REMOTE_FILE_SOURCE_CMD } from '../../common/commands';

vi.mock('vscode');

const MOCK_EXECUTION_TIME_MS = 100;

const MOCK_FOLDER_URIS = [
  'dh://server1/path/to/folder1',
  'dh://server2/path/to/folder2/',
  'file:///local/path/',
];

const EXPECTED_SUCCESS = {
  success: true,
  message: 'Remote file sources added successfully',
  details: { foldersAdded: 3 },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_ERROR = {
  success: false,
  message: 'Failed to add remote file sources: Command failed',
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

describe('addRemoteFileSources', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(McpToolResponse.prototype, 'getElapsedTimeMs').mockReturnValue(
      MOCK_EXECUTION_TIME_MS
    );

    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);
  });

  it('should return correct tool spec', () => {
    const tool = createAddRemoteFileSourcesTool();

    expect(tool.name).toBe('addRemoteFileSources');
    expect(tool.spec.title).toBe('Add Remote File Sources');
    expect(tool.spec.description).toBe(
      'Add one or more remote file source folders to the workspace.'
    );
  });

  it('should add remote file sources successfully', async () => {
    const tool = createAddRemoteFileSourcesTool();
    const result = await tool.handler({ folderUris: MOCK_FOLDER_URIS });

    expect(vscode.Uri.parse).toHaveBeenCalledTimes(3);
    expect(vscode.Uri.parse).toHaveBeenCalledWith('dh://server1/path/to/folder1');
    expect(vscode.Uri.parse).toHaveBeenCalledWith('dh://server2/path/to/folder2');
    expect(vscode.Uri.parse).toHaveBeenCalledWith('file:///local/path');

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      ADD_REMOTE_FILE_SOURCE_CMD,
      expect.any(Array)
    );

    expect(result.structuredContent).toEqual(EXPECTED_SUCCESS);
  });

  it('should strip trailing slashes from URIs', async () => {
    const tool = createAddRemoteFileSourcesTool();
    await tool.handler({ folderUris: ['dh://server/folder/'] });

    expect(vscode.Uri.parse).toHaveBeenCalledWith('dh://server/folder');
  });

  it('should handle single folder URI', async () => {
    const tool = createAddRemoteFileSourcesTool();
    const result = await tool.handler({ folderUris: ['dh://server/folder'] });

    expect(result.structuredContent).toEqual({
      success: true,
      message: 'Remote file sources added successfully',
      details: { foldersAdded: 1 },
      executionTimeMs: MOCK_EXECUTION_TIME_MS,
    });
  });

  it('should handle empty array', async () => {
    const tool = createAddRemoteFileSourcesTool();
    const result = await tool.handler({ folderUris: [] });

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      ADD_REMOTE_FILE_SOURCE_CMD,
      []
    );

    expect(result.structuredContent).toEqual({
      success: true,
      message: 'Remote file sources added successfully',
      details: { foldersAdded: 0 },
      executionTimeMs: MOCK_EXECUTION_TIME_MS,
    });
  });

  it('should handle command execution error', async () => {
    const error = new Error('Command failed');
    vi.mocked(vscode.commands.executeCommand).mockRejectedValue(error);

    const tool = createAddRemoteFileSourcesTool();
    const result = await tool.handler({ folderUris: MOCK_FOLDER_URIS });

    expect(result.structuredContent).toEqual(EXPECTED_ERROR);
  });

  it('should handle URI parsing error', async () => {
    const error = new Error('Invalid URI');
    vi.mocked(vscode.Uri.parse).mockImplementation(() => {
      throw error;
    });

    const tool = createAddRemoteFileSourcesTool();
    const result = await tool.handler({ folderUris: ['invalid'] });

    expect(result.structuredContent).toEqual({
      success: false,
      message: 'Failed to add remote file sources: Invalid URI',
      executionTimeMs: MOCK_EXECUTION_TIME_MS,
    });
  });
});
