import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createRunCodeFromUriTool } from './runCodeFromUri';
import type { IServerManager } from '../../types';
import type { FilteredWorkspace } from '../../services';
import { McpToolResponse } from '../utils/mcpUtils';
import { ConnectionNotFoundError } from '../../common';

vi.mock('vscode');

const MOCK_EXECUTION_TIME_MS = 100;

const MOCK_URI_STRING = 'file:///path/to/file.py';
const MOCK_CONNECTION_URL = 'http://localhost:10000';

const MOCK_DOCUMENT = {
  languageId: 'python',
} as vscode.TextDocument;

const MOCK_FILE_STAT = {
  type: vscode.FileType.File,
} as vscode.FileStat;

const EXPECTED_INVALID_URI = {
  success: false,
  message: 'Invalid URI: Invalid URI',
  details: { uri: 'not-a-uri' },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_FILE_NOT_FOUND = {
  success: false,
  message: 'File not found: File not found',
  details: { uri: '/path/to/file.py' },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_INVALID_URL = {
  success: false,
  message: 'Invalid URL: Invalid URL',
  details: { connectionUrl: 'not-a-url' },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_CONNECTION_NOT_FOUND = {
  success: false,
  message:
    'Failed to execute code: No connection found for URL: http://localhost:10000/',
  hint: 'No available connections supporting languageId python.',
  details: { languageId: 'python' },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_GENERAL_ERROR = {
  success: false,
  message: 'Failed to execute code: Unexpected error',
  details: { languageId: 'python' },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

describe('runCodeFromUri tool', () => {
  let serverManager: IServerManager;
  let pythonDiagnostics: vscode.DiagnosticCollection;
  let pythonWorkspace: FilteredWorkspace;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock getElapsedTimeMs to return a fixed value
    vi.spyOn(McpToolResponse.prototype, 'getElapsedTimeMs').mockReturnValue(
      MOCK_EXECUTION_TIME_MS
    );

    pythonDiagnostics = vscode.languages.createDiagnosticCollection('python');

    pythonWorkspace = {
      getUserFiles: vi.fn(),
    } as unknown as FilteredWorkspace;

    serverManager = {
      getConnections: vi.fn(),
      getServer: vi.fn(),
      getUriConnection: vi.fn(),
    } as unknown as IServerManager;
  });

  it('should have correct spec', () => {
    const tool = createRunCodeFromUriTool({
      pythonDiagnostics,
      pythonWorkspace,
      serverManager,
    });

    expect(tool.name).toBe('runCodeFromUri');
    expect(tool.spec.title).toBe('Run Deephaven Code from URI');
    expect(tool.spec.description).toBe(
      'Execute code from a workspace file URI in a Deephaven session. Can run the entire file or constrain execution to the current selection within the file.'
    );
  });

  describe('input validation', () => {
    it.each([
      {
        name: 'invalid URI',
        uri: 'not-a-uri',
        connectionUrl: undefined,
        expected: EXPECTED_INVALID_URI,
      },
      {
        name: 'file does not exist',
        uri: MOCK_URI_STRING,
        connectionUrl: undefined,
        statResult: new Error('File not found'),
        expected: EXPECTED_FILE_NOT_FOUND,
      },
      {
        name: 'invalid URL',
        uri: MOCK_URI_STRING,
        connectionUrl: 'not-a-url',
        statResult: MOCK_FILE_STAT,
        expected: EXPECTED_INVALID_URL,
      },
    ])(
      'should reject $name',
      async ({ uri, connectionUrl, statResult, expected }) => {
        if (statResult instanceof Error) {
          vi.mocked(vscode.workspace.fs.stat).mockRejectedValue(statResult);
        } else if (statResult) {
          vi.mocked(vscode.workspace.fs.stat).mockResolvedValue(statResult);
        }

        const tool = createRunCodeFromUriTool({
          pythonDiagnostics,
          pythonWorkspace,
          serverManager,
        });

        const result = await tool.handler({
          uri,
          connectionUrl,
        });

        expect(result.structuredContent).toEqual(expected);
      }
    );
  });

  describe('error handling', () => {
    beforeEach(() => {
      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue(MOCK_FILE_STAT);
      vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(
        MOCK_DOCUMENT
      );
      vi.mocked(serverManager.getConnections).mockReturnValue([]);
      vi.mocked(serverManager.getServer).mockReturnValue(undefined);
    });

    it.each([
      {
        name: 'ConnectionNotFoundError with hint',
        error: new ConnectionNotFoundError(new URL(MOCK_CONNECTION_URL)),
        connectionUrl: MOCK_CONNECTION_URL,
        expected: EXPECTED_CONNECTION_NOT_FOUND,
      },
      {
        name: 'general exceptions during execution',
        error: new Error('Unexpected error'),
        connectionUrl: undefined,
        expected: EXPECTED_GENERAL_ERROR,
      },
    ])('should handle $name', async ({ error, connectionUrl, expected }) => {
      vi.mocked(vscode.commands.executeCommand).mockRejectedValue(error);

      const tool = createRunCodeFromUriTool({
        pythonDiagnostics,
        pythonWorkspace,
        serverManager,
      });

      const result = await tool.handler({
        uri: MOCK_URI_STRING,
        connectionUrl,
      });

      expect(result.structuredContent).toEqual(expected);
    });
  });
});
