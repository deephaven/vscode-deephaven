import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { createRemoveRemoteFileSourcesTool } from './removeRemoteFileSources';
import * as commands from '../../common/commands';
import {
  fakeMcpToolTimings,
  mcpErrorResult,
  mcpSuccessResult,
} from '../utils/mcpTestUtils';

vi.mock('vscode');
vi.mock('../../common/commands', async () => {
  const actual = await vi.importActual('../../common/commands');
  return {
    ...actual,
    execRemoveRemoteFileSource: vi.fn().mockResolvedValue(undefined),
  };
});

describe('removeRemoteFileSources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeMcpToolTimings();
  });

  it('should return correct tool spec', () => {
    const tool = createRemoveRemoteFileSourcesTool();

    expect(tool.name).toBe('removeRemoteFileSources');
    expect(tool.spec.title).toBe('Remove Remote File Sources');
    expect(tool.spec.description).toBe(
      'Remove one or more remote file source folders from the workspace.'
    );
  });

  it.each([
    {
      scenario: 'multiple URIs (python)',
      folderUris: [
        'file:///server1/path/to/folder1',
        'file:///server2/path/to/folder2/',
        'file:///local/path/',
      ],
      languageId: 'python' as const,
      expectedParsedUris: [
        'file:///server1/path/to/folder1',
        'file:///server2/path/to/folder2',
        'file:///local/path',
      ],
      expectedLanguageId: 'python',
    },
    {
      scenario: 'single folder URI (python)',
      folderUris: ['file:///server/folder'],
      languageId: 'python' as const,
      expectedParsedUris: ['file:///server/folder'],
      expectedLanguageId: 'python',
    },
    {
      scenario: 'empty array',
      folderUris: [],
      languageId: 'python' as const,
      expectedParsedUris: [],
      expectedLanguageId: 'python',
    },
    {
      scenario: 'duplicate URIs with mixed trailing slashes',
      folderUris: [
        'file:///server/folder',
        'file:///server/folder',
        'file:///server/folder/',
      ],
      languageId: 'python' as const,
      expectedParsedUris: ['file:///server/folder'],
      expectedLanguageId: 'python',
    },
    {
      scenario: 'groovy language ID',
      folderUris: ['file:///server/groovy/package3'],
      languageId: 'groovy' as const,
      expectedParsedUris: ['file:///server/groovy/package3'],
      expectedLanguageId: 'groovy',
    },
  ])(
    'should handle $scenario',
    async ({ folderUris, languageId, expectedParsedUris, expectedLanguageId }) => {
      const tool = createRemoveRemoteFileSourcesTool();
      const result = await tool.handler({ folderUris, languageId });

      expect(commands.execRemoveRemoteFileSource).toHaveBeenCalledWith(
        expectedLanguageId,
        expectedParsedUris.map(uri => vscode.Uri.parse(uri))
      );
      expect(result.structuredContent).toEqual(
        mcpSuccessResult('Remote file sources removed successfully', {
          foldersRemoved: expectedParsedUris.length,
        })
      );
    }
  );

  it.each([
    {
      scenario: 'command execution error',
      mockSetup: (): void => {
        vi.mocked(commands.execRemoveRemoteFileSource).mockRejectedValue(
          new Error('Command failed')
        );
      },
      folderUris: ['file:///server/folder'],
      languageId: 'python' as const,
      expectedMessage: 'Failed to remove remote file sources: Command failed',
    },
    {
      scenario: 'URI parsing error',
      mockSetup: (): void => {
        vi.mocked(vscode.Uri.parse).mockImplementation(() => {
          throw new Error('Invalid URI');
        });
      },
      folderUris: ['invalid-uri'],
      languageId: 'python' as const,
      expectedMessage: 'Failed to remove remote file sources: Invalid URI',
    },
  ])(
    'should handle $scenario',
    async ({ mockSetup, folderUris, languageId, expectedMessage }) => {
      mockSetup();

      const tool = createRemoveRemoteFileSourcesTool();
      const result = await tool.handler({ folderUris, languageId });

      expect(result.structuredContent).toEqual(
        mcpErrorResult(expectedMessage, { folderUris })
      );
    }
  );
});
