import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { createAddRemoteFileSourcesTool } from './addRemoteFileSources';
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
    execAddRemoteFileSource: vi.fn().mockResolvedValue(undefined),
  };
});

describe('addRemoteFileSources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeMcpToolTimings();
  });

  it('should return correct tool spec', () => {
    const tool = createAddRemoteFileSourcesTool();

    expect(tool.name).toBe('addRemoteFileSources');
    expect(tool.spec.title).toBe('Add Remote File Sources');
    expect(tool.spec.description).toBe(
      'Add folder(s) as remote file sources (allows server to fetch source files on-demand during script execution).'
    );
  });

  it.each([
    {
      scenario: 'multiple URIs',
      folderUris: [
        'file:///server1/path/to/folder1',
        'file:///server2/path/to/folder2/',
        'file:///local/path/',
      ],
      expectedParsedUris: [
        'file:///server1/path/to/folder1',
        'file:///server2/path/to/folder2',
        'file:///local/path',
      ],
    },
    {
      scenario: 'single folder URI',
      folderUris: ['file:///server/folder'],
      expectedParsedUris: ['file:///server/folder'],
    },
    {
      scenario: 'empty array',
      folderUris: [],
      expectedParsedUris: [],
    },
    {
      scenario: 'duplicate URIs with mixed trailing slashes',
      folderUris: [
        'file:///server/folder',
        'file:///server/folder',
        'file:///server/folder/',
      ],
      expectedParsedUris: ['file:///server/folder'],
    },
  ])('should handle $scenario', async ({ folderUris, expectedParsedUris }) => {
    const tool = createAddRemoteFileSourcesTool();
    const result = await tool.handler({ folderUris });

    expect(commands.execAddRemoteFileSource).toHaveBeenCalledWith(
      expectedParsedUris.map(uri => vscode.Uri.parse(uri))
    );

    expect(result.structuredContent).toEqual(
      mcpSuccessResult('Remote file sources added successfully', {
        foldersAdded: expectedParsedUris.length,
      })
    );
  });

  it.each([
    {
      scenario: 'command execution error',
      mockSetup: (): void => {
        vi.mocked(commands.execAddRemoteFileSource).mockRejectedValue(
          new Error('Command failed')
        );
      },
      folderUris: ['file:///server/folder'],
      expectedMessage: 'Failed to add remote file sources: Command failed',
    },
    {
      scenario: 'URI parsing error',
      mockSetup: (): void => {
        vi.mocked(vscode.Uri.parse).mockImplementation(() => {
          throw new Error('Invalid URI');
        });
      },
      folderUris: ['invalid-uri'],
      expectedMessage: 'Failed to add remote file sources: Invalid URI',
    },
  ])(
    'should handle $scenario',
    async ({ mockSetup, folderUris, expectedMessage }) => {
      mockSetup();

      const tool = createAddRemoteFileSourcesTool();
      const result = await tool.handler({ folderUris });

      expect(result.structuredContent).toEqual(
        mcpErrorResult(expectedMessage, { folderUris })
      );
    }
  );
});
