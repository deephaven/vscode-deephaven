import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { createListRemoteFileSourcesTool } from './listRemoteFileSources';
import { McpToolResponse } from '../utils/mcpUtils';
import type { FilteredWorkspace } from '../../services';

vi.mock('vscode');

const MOCK_EXECUTION_TIME_MS = 100;

const createMockWorkspace = (
  folderUris: vscode.Uri[] | Error
): FilteredWorkspace => {
  const folders =
    folderUris instanceof Error ? folderUris : folderUris.map(uri => ({ uri }));

  return {
    getTopLevelMarkedFolders:
      folders instanceof Error
        ? vi.fn().mockImplementation(() => {
            throw folders;
          })
        : vi.fn().mockReturnValue(folders),
  } as unknown as FilteredWorkspace;
};

describe('listRemoteFileSources', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(McpToolResponse.prototype, 'getElapsedTimeMs').mockReturnValue(
      MOCK_EXECUTION_TIME_MS
    );
  });

  it('should return correct tool spec', () => {
    const mockWorkspace = createMockWorkspace([]);
    const tool = createListRemoteFileSourcesTool(mockWorkspace);

    expect(tool.name).toBe('listRemoteFileSources');
    expect(tool.spec.title).toBe('List Remote File Sources');
    expect(tool.spec.description).toBe(
      'List all remote file source folders in the workspace.'
    );
  });

  it.each([
    {
      scenario: 'no remote file sources',
      folderUris: [],
      expectedMessage: 'Found 0 remote file sources',
    },
    {
      scenario: 'single remote file source',
      folderUris: ['file:///server/folder'],
      expectedMessage: 'Found 1 remote file source',
    },
    {
      scenario: 'multiple remote file sources',
      folderUris: [
        'file:///server1/path/to/folder1',
        'file:///server2/path/to/folder2',
      ],
      expectedMessage: 'Found 2 remote file sources',
    },
    {
      scenario: 'large number of folders',
      folderUris: Array.from(
        { length: 50 },
        (_, i) => `file:///server/folder${i}`
      ),
      expectedMessage: 'Found 50 remote file sources',
    },
  ])('should handle $scenario', async ({ folderUris, expectedMessage }) => {
    const mockWorkspace = createMockWorkspace(
      folderUris.map(uri => vscode.Uri.parse(uri))
    );
    const tool = createListRemoteFileSourcesTool(mockWorkspace);
    const result = await tool.handler({});

    expect(mockWorkspace.getTopLevelMarkedFolders).toHaveBeenCalledOnce();
    expect(result.structuredContent).toEqual({
      success: true,
      message: expectedMessage,
      details: { folderUris },
      executionTimeMs: MOCK_EXECUTION_TIME_MS,
    });
  });

  it('should handle error from getTopLevelMarkedFolders', async () => {
    const error = new Error('Test error');
    const mockWorkspace = createMockWorkspace(error);
    const tool = createListRemoteFileSourcesTool(mockWorkspace);
    const result = await tool.handler({});

    expect(result.structuredContent).toEqual({
      success: false,
      message: 'Failed to list remote file sources: Test error',
      executionTimeMs: MOCK_EXECUTION_TIME_MS,
    });
  });
});
