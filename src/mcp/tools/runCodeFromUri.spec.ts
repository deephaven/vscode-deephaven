import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createRunCodeFromUriTool } from './runCodeFromUri';
import type { IDhcService, IServerManager } from '../../types';
import type { FilteredWorkspace } from '../../services';
import { DhcService } from '../../services';
import { getFirstConnectionOrCreate, McpToolResponse } from '../utils/mcpUtils';
import {
  mcpErrorResult,
  mcpSuccessResult,
  MOCK_EXECUTION_TIME_MS,
} from '../utils/mcpTestUtils';
import { ConnectionNotFoundError } from '../../common';
import {
  createConnectionNotFoundHint,
  createPythonModuleImportErrorHint,
  getDiagnosticsErrors,
  type DiagnosticsError,
} from '../utils/runCodeUtils';

vi.mock('vscode');
vi.mock('../utils/mcpUtils', async () => {
  const actual = await vi.importActual('../utils/mcpUtils');
  return {
    ...actual,
    getFirstConnectionOrCreate: vi.fn(),
  };
});
vi.mock('../utils/runCodeUtils', async () => {
  const actual = await vi.importActual('../utils/runCodeUtils');
  return {
    ...actual,
    createConnectionNotFoundHint: vi.fn(),
    createPythonModuleImportErrorHint: vi.fn(),
    getDiagnosticsErrors: vi.fn(),
  };
});

const MOCK_HINT = {
  hint: 'mock.hint',
  foundMatchingFolderUris: ['file:///workspace/mockmodule'],
};

const MOCK_URI_STRING = 'file:///path/to/file.py';

const MOCK_DIAGNOSTIC_ERRORS: DiagnosticsError[] = [
  {
    uri: MOCK_URI_STRING,
    message: "name 'undefined_var' is not defined",
    range: new vscode.Range(5, 0, 5, 13),
  },
];
const MOCK_CONNECTION_URL = 'http://localhost:10000';
const MOCK_PARSED_CONNECTION_URL = new URL(MOCK_CONNECTION_URL);
const MOCK_PANEL_URL_FORMAT = `${MOCK_CONNECTION_URL}/iframe/widget/?name=<variableTitle>`;

const MOCK_DOCUMENT = {
  languageId: 'python',
} as vscode.TextDocument;

const MOCK_FILE_STAT = {
  type: vscode.FileType.File,
} as vscode.FileStat;

const MOCK_RUN_CODE_SUCCESS = {
  error: null,
  changes: {
    created: [{ id: 'x', title: 'x', type: 'int' }],
    updated: [],
  },
} as const;

const MOCK_RUN_CODE_ERROR = {
  error: 'NameError: name "undefined_var" is not defined',
  changes: {
    created: [{ id: 'y', title: 'y', type: 'str' }],
    updated: [],
  },
} as const;

describe('runCodeFromUri tool', () => {
  const pythonDiagnostics: vscode.DiagnosticCollection =
    vscode.languages.createDiagnosticCollection('python');

  const pythonWorkspace = {
    getUserFiles: vi.fn(),
  } as unknown as FilteredWorkspace;

  const serverManager = {
    getUriConnection: vi.fn(),
  } as unknown as IServerManager;

  const mockExecuteCommand = vi.fn();

  beforeEach(() => {
    // clear diagnostics before `clearAllMocks` since `clear` is actually a mock
    // and we also want to reset its call count
    pythonDiagnostics.clear();

    vi.clearAllMocks();

    // Mock getElapsedTimeMs to return a fixed value
    vi.spyOn(McpToolResponse.prototype, 'getElapsedTimeMs').mockReturnValue(
      MOCK_EXECUTION_TIME_MS
    );

    mockExecuteCommand.mockResolvedValue(undefined);
    vi.mocked(vscode.commands.executeCommand).mockImplementation(
      mockExecuteCommand
    );
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

  describe('connection error handling', () => {
    beforeEach(() => {
      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue(MOCK_FILE_STAT);
      vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(
        MOCK_DOCUMENT
      );
    });

    it('should return error when connection establishment fails', async () => {
      const errorMessage = 'No connections or server found';
      const hint = 'No available connections supporting languageId python.';
      vi.mocked(getFirstConnectionOrCreate).mockResolvedValue({
        success: false,
        errorMessage,
        hint,
        details: { connectionUrl: MOCK_CONNECTION_URL + '/' },
      });

      const tool = createRunCodeFromUriTool({
        pythonDiagnostics,
        pythonWorkspace,
        serverManager,
      });

      const result = await tool.handler({
        uri: MOCK_URI_STRING,
        connectionUrl: MOCK_CONNECTION_URL,
      });

      expect(getFirstConnectionOrCreate).toHaveBeenCalledWith({
        serverManager,
        connectionUrl: MOCK_PARSED_CONNECTION_URL,
        languageId: 'python',
      });
      expect(result.structuredContent).toEqual(
        mcpErrorResult(
          errorMessage,
          { connectionUrl: MOCK_CONNECTION_URL + '/' },
          hint
        )
      );
    });
  });

  describe('input validation', () => {
    it.each([
      {
        name: 'invalid URI',
        uri: 'not-a-uri',
        connectionUrl: undefined,
        expected: mcpErrorResult('Invalid URI: Invalid URI', {
          uri: 'not-a-uri',
        }),
      },
      {
        name: 'file does not exist',
        uri: MOCK_URI_STRING,
        connectionUrl: undefined,
        statResult: new Error('File not found'),
        expected: mcpErrorResult('File not found: File not found', {
          uri: '/path/to/file.py',
        }),
      },
      {
        name: 'invalid URL',
        uri: MOCK_URI_STRING,
        connectionUrl: 'not-a-url',
        statResult: MOCK_FILE_STAT,
        expected: mcpErrorResult('Invalid URL: Invalid URL', {
          connectionUrl: 'not-a-url',
        }),
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

  describe('code execution', () => {
    const mockConnection: IDhcService = Object.assign(
      Object.create(DhcService.prototype),
      {
        serverUrl: new URL('http://localhost:10000'),
        getPsk: vi.fn().mockResolvedValue(undefined),
      }
    );

    beforeEach(() => {
      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue(MOCK_FILE_STAT);
      vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(
        MOCK_DOCUMENT
      );
      vi.mocked(serverManager.getUriConnection).mockReturnValue(mockConnection);
      vi.mocked(getDiagnosticsErrors).mockReturnValue(MOCK_DIAGNOSTIC_ERRORS);

      vi.mocked(getFirstConnectionOrCreate).mockResolvedValue({
        success: true,
        connection: mockConnection,
        panelUrlFormat: MOCK_PANEL_URL_FORMAT,
      });
    });

    it.each([
      {
        name: 'execute code successfully',
        cmdResult: MOCK_RUN_CODE_SUCCESS,
        connectionUrl: MOCK_CONNECTION_URL,
        expected: mcpSuccessResult('Code executed successfully', {
          variables: [{ id: 'x', title: 'x', type: 'int', isNew: true }],
          panelUrlFormat: MOCK_PANEL_URL_FORMAT,
        }),
      },
      {
        name: 'handle code execution failure with Python diagnostics and hint',
        cmdResult: MOCK_RUN_CODE_ERROR,
        connectionUrl: MOCK_CONNECTION_URL,
        pythonHint: MOCK_HINT,
        expected: mcpErrorResult(
          "Code execution failed: file:///path/to/file.py: name 'undefined_var' is not defined [5:0]",
          {
            languageId: 'python',
            variables: [{ id: 'y', title: 'y', type: 'str', isNew: true }],
            foundMatchingFolderUris: MOCK_HINT.foundMatchingFolderUris,
          },
          MOCK_HINT.hint
        ),
      },
      {
        name: 'handle code execution failure with Python diagnostics without hint',
        cmdResult: MOCK_RUN_CODE_ERROR,
        connectionUrl: MOCK_CONNECTION_URL,
        pythonHint: undefined,
        expected: mcpErrorResult(
          "Code execution failed: file:///path/to/file.py: name 'undefined_var' is not defined [5:0]",
          {
            languageId: 'python',
            variables: [{ id: 'y', title: 'y', type: 'str', isNew: true }],
          }
        ),
      },
      {
        name: 'handle ConnectionNotFoundError during code execution',
        cmdResult: new ConnectionNotFoundError(new URL(MOCK_CONNECTION_URL)),
        connectionUrl: MOCK_CONNECTION_URL,
        connectionNotFoundHint:
          'No available connections supporting languageId python.',
        expected: mcpErrorResult(
          'Failed to execute code: No connection found for URL: http://localhost:10000/',
          { languageId: 'python' },
          'No available connections supporting languageId python.'
        ),
      },
      {
        name: 'handle general exceptions during execution',
        cmdResult: new Error('Unexpected error'),
        connectionUrl: MOCK_CONNECTION_URL,
        expected: mcpErrorResult('Failed to execute code: Unexpected error', {
          languageId: 'python',
        }),
      },
    ])(
      'should $name',
      async ({
        cmdResult,
        connectionUrl,
        pythonHint,
        connectionNotFoundHint,
        expected,
      }) => {
        if (cmdResult instanceof Error) {
          vi.mocked(vscode.commands.executeCommand).mockRejectedValue(
            cmdResult
          );
          if (connectionNotFoundHint) {
            vi.mocked(createConnectionNotFoundHint).mockResolvedValue(
              connectionNotFoundHint
            );
          }
        } else {
          vi.mocked(vscode.commands.executeCommand).mockResolvedValue(
            cmdResult
          );
        }

        vi.mocked(createPythonModuleImportErrorHint).mockReturnValue(
          pythonHint
        );

        const tool = createRunCodeFromUriTool({
          pythonDiagnostics,
          pythonWorkspace,
          serverManager,
        });

        const result = await tool.handler({
          uri: MOCK_URI_STRING,
          connectionUrl,
        });

        expect(getFirstConnectionOrCreate).toHaveBeenCalledWith({
          serverManager,
          connectionUrl: MOCK_PARSED_CONNECTION_URL,
          languageId: 'python',
        });
        expect(result.structuredContent).toEqual(expected);
      }
    );
  });
});
