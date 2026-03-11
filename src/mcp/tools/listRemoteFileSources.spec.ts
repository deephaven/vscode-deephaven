import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { createListRemoteFileSourcesTool } from './listRemoteFileSources';
import type { FilteredWorkspace } from '../../services';
import {
  fakeMcpToolTimings,
  mcpErrorResult,
  mcpSuccessResult,
} from '../utils/mcpTestUtils';
import type { GroovyPackageName, PythonModuleFullname } from '../../types';

vi.mock('vscode');

function createMockWorkspace<
  T extends GroovyPackageName | PythonModuleFullname,
>(folderUris: vscode.Uri[] | Error): FilteredWorkspace<T> {
  const folders =
    folderUris instanceof Error ? folderUris : folderUris.map(uri => ({ uri }));

  return {
    getTopLevelMarkedFolders:
      folders instanceof Error
        ? vi.fn().mockImplementation(() => {
            throw folders;
          })
        : vi.fn().mockReturnValue(folders),
  } as unknown as FilteredWorkspace<T>;
}

const emptyGroovyWorkspace = createMockWorkspace<GroovyPackageName>([]);

describe('listRemoteFileSources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeMcpToolTimings();
  });

  it('should return correct tool spec', () => {
    const mockWorkspace = createMockWorkspace<PythonModuleFullname>([]);
    const tool = createListRemoteFileSourcesTool({
      groovyWorkspace: emptyGroovyWorkspace,
      pythonWorkspace: mockWorkspace,
    });

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
  ])(
    'should handle $scenario (python only)',
    async ({ folderUris, expectedMessage }) => {
      const mockWorkspace = createMockWorkspace<PythonModuleFullname>(
        folderUris.map(uri => vscode.Uri.parse(uri))
      );
      const tool = createListRemoteFileSourcesTool({
        groovyWorkspace: emptyGroovyWorkspace,
        pythonWorkspace: mockWorkspace,
      });
      const result = await tool.handler({});

      expect(mockWorkspace.getTopLevelMarkedFolders).toHaveBeenCalledOnce();
      expect(result.structuredContent).toEqual(
        mcpSuccessResult(expectedMessage, { folderUris })
      );
    }
  );

  it('should include Groovy and Python sources together', async () => {
    const groovyUris = ['file:///workspace/package3'].map(uri =>
      vscode.Uri.parse(uri)
    );
    const pythonUris = ['file:///workspace/mymodule'].map(uri =>
      vscode.Uri.parse(uri)
    );
    const groovyWorkspace = createMockWorkspace<GroovyPackageName>(groovyUris);
    const pythonWorkspace =
      createMockWorkspace<PythonModuleFullname>(pythonUris);

    const tool = createListRemoteFileSourcesTool({
      groovyWorkspace,
      pythonWorkspace,
    });
    const result = await tool.handler({});

    expect(result.structuredContent).toEqual(
      mcpSuccessResult('Found 2 remote file sources', {
        folderUris: [
          'file:///workspace/package3',
          'file:///workspace/mymodule',
        ],
      })
    );
  });

  it('should handle error from getTopLevelMarkedFolders', async () => {
    const error = new Error('Test error');
    const mockWorkspace = createMockWorkspace<PythonModuleFullname>(error);
    const tool = createListRemoteFileSourcesTool({
      groovyWorkspace: emptyGroovyWorkspace,
      pythonWorkspace: mockWorkspace,
    });
    const result = await tool.handler({});

    expect(result.structuredContent).toEqual(
      mcpErrorResult('Failed to list remote file sources: Test error')
    );
  });
});
