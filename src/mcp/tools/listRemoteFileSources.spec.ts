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

describe('listRemoteFileSources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeMcpToolTimings();
  });

  it('should return correct tool spec', () => {
    const groovyWorkspace = createMockWorkspace<GroovyPackageName>([]);
    const pythonWorkspace = createMockWorkspace<PythonModuleFullname>([]);

    const tool = createListRemoteFileSourcesTool({
      groovyWorkspace,
      pythonWorkspace,
    });

    expect(tool.name).toBe('listRemoteFileSources');
    expect(tool.spec.title).toBe('List Remote File Sources');
    expect(tool.spec.description).toBe(
      'List all remote file source folders in the workspace.'
    );
  });

  describe.each(['groovy', 'python'] as const)('single source', languageId => {
    it.each([
      {
        scenario: 'no remote file sources',
        folderUriStrings: [],
        expectedMessage: 'Found 0 remote file sources',
      },
      {
        scenario: 'single remote file source',
        folderUriStrings: ['file:///server/folder'],
        expectedMessage: 'Found 1 remote file source',
      },
      {
        scenario: 'multiple remote file sources',
        folderUriStrings: [
          'file:///server1/path/to/folder1',
          'file:///server2/path/to/folder2',
        ],
        expectedMessage: 'Found 2 remote file sources',
      },
      {
        scenario: 'large number of folders',
        folderUriStrings: Array.from(
          { length: 50 },
          (_, i) => `file:///server/folder${i}`
        ),
        expectedMessage: 'Found 50 remote file sources',
      },
    ])(
      `should handle ${languageId} $scenario`,
      async ({ folderUriStrings, expectedMessage }) => {
        const folderUris = folderUriStrings.map(uri => vscode.Uri.parse(uri));

        const pythonWorkspace = createMockWorkspace<PythonModuleFullname>(
          languageId === 'python' ? folderUris : []
        );
        const groovyWorkspace = createMockWorkspace<GroovyPackageName>(
          languageId === 'groovy' ? folderUris : []
        );

        const tool = createListRemoteFileSourcesTool({
          groovyWorkspace,
          pythonWorkspace,
        });
        const result = await tool.handler({ languageId });

        const [yesWorkspace, noWorkspace] =
          languageId === 'groovy'
            ? [groovyWorkspace, pythonWorkspace]
            : [pythonWorkspace, groovyWorkspace];

        expect(yesWorkspace.getTopLevelMarkedFolders).toHaveBeenCalledOnce();
        expect(noWorkspace.getTopLevelMarkedFolders).not.toHaveBeenCalled();

        expect(result.structuredContent).toEqual(
          mcpSuccessResult(expectedMessage, { folderUris: folderUriStrings })
        );
      }
    );

    it(`should handle ${languageId} error from getTopLevelMarkedFolders`, async () => {
      const error = new Error('Test error');

      const groovyWorkspace = createMockWorkspace<GroovyPackageName>(
        languageId === 'groovy' ? error : []
      );
      const pythonWorkspace = createMockWorkspace<PythonModuleFullname>(
        languageId === 'python' ? error : []
      );

      const tool = createListRemoteFileSourcesTool({
        groovyWorkspace,
        pythonWorkspace,
      });
      const result = await tool.handler({});

      expect(result.structuredContent).toEqual(
        mcpErrorResult('Failed to list remote file sources: Test error')
      );
    });
  });

  it('should include Groovy and Python sources together', async () => {
    const groovyFolder = 'file:///workspace/package3';
    const groovyUris = [groovyFolder].map(uri => vscode.Uri.parse(uri));

    const pythonFolder = 'file:///workspace/mymodule';
    const pythonUris = [pythonFolder].map(uri => vscode.Uri.parse(uri));

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
        folderUris: [groovyFolder, pythonFolder],
      })
    );
  });
});
