import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createRunCodeFromUriTool } from './runCodeFromUri';
import type { IDhcService, IServerManager, ServerState } from '../../types';
import type { FilteredWorkspace } from '../../services';
import { DhcService } from '../../services';
import { McpToolResponse } from '../utils/mcpUtils';
import { ConnectionNotFoundError, CONNECT_TO_SERVER_CMD } from '../../common';
import {
  createConnectionNotFoundHint,
  createPythonModuleImportErrorHint,
  getDiagnosticsErrors,
  type DiagnosticsError,
} from '../utils/runCodeUtils';

vi.mock('vscode');
vi.mock('../utils/runCodeUtils', async () => {
  const actual = await vi.importActual('../utils/runCodeUtils');
  return {
    ...actual,
    createConnectionNotFoundHint: vi.fn(),
    createPythonModuleImportErrorHint: vi.fn(),
    getDiagnosticsErrors: vi.fn(),
  };
});

const MOCK_EXECUTION_TIME_MS = 100;
const MOCK_HINT = {
  hint: 'mock.hint',
  foundMatchingFolderUris: ['file:///workspace/mockmodule'],
};
const MOCK_CONNECTION_NOT_FOUND_HINT =
  'No available connections supporting languageId python.';

const MOCK_URI_STRING = 'file:///path/to/file.py';

const MOCK_DIAGNOSTIC_ERRORS: DiagnosticsError[] = [
  {
    uri: MOCK_URI_STRING,
    message: "name 'undefined_var' is not defined",
    range: new vscode.Range(5, 0, 5, 13),
  },
];
const MOCK_CONNECTION_URL = 'http://localhost:10000';

const MOCK_SERVER_RUNNING: ServerState = {
  isRunning: true,
  type: 'DHC',
  url: new URL('http://localhost:10000'),
  isConnected: false,
  connectionCount: 0,
};

const MOCK_SERVER_NOT_RUNNING: ServerState = {
  isRunning: false,
  type: 'DHC',
  url: new URL('http://localhost:10000'),
  isConnected: false,
  connectionCount: 0,
};

const MOCK_SERVER_DHE: ServerState = {
  isRunning: true,
  type: 'DHE',
  url: new URL('http://localhost:10000'),
  isConnected: false,
  connectionCount: 0,
};

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
  hint: MOCK_CONNECTION_NOT_FOUND_HINT,
  details: { languageId: 'python' },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_NO_CONNECTIONS_OR_SERVER = {
  success: false,
  message: 'No connections or server found',
  hint: MOCK_CONNECTION_NOT_FOUND_HINT,
  details: { connectionUrl: MOCK_CONNECTION_URL + '/' },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_SERVER_NOT_RUNNING = {
  success: false,
  message: 'Server is not running',
  details: { connectionUrl: MOCK_CONNECTION_URL + '/' },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_NO_ACTIVE_CONNECTION = {
  success: false,
  message: 'No active connection',
  hint: 'Use connectToServer first',
  details: { connectionUrl: MOCK_CONNECTION_URL + '/' },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_FAILED_TO_CONNECT = {
  success: false,
  message: 'Failed to connect to server',
  details: { connectionUrl: MOCK_CONNECTION_URL + '/' },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_GENERAL_ERROR = {
  success: false,
  message: 'Failed to execute code: Unexpected error',
  details: { languageId: 'python' },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

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

const EXPECTED_SUCCESS = {
  success: true,
  message: 'Code executed successfully',
  details: {
    variables: [{ id: 'x', title: 'x', type: 'int', isNew: true }],
    panelUrlFormat:
      'http://localhost:10000/iframe/widget/?name=<variableTitle>',
  },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_CODE_EXECUTION_FAILED = {
  success: false,
  message:
    "Code execution failed: file:///path/to/file.py: name 'undefined_var' is not defined [5:0]",
  hint: MOCK_HINT.hint,
  details: {
    languageId: 'python',
    variables: [{ id: 'y', title: 'y', type: 'str', isNew: true }],
    foundMatchingFolderUris: MOCK_HINT.foundMatchingFolderUris,
  },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_CODE_EXECUTION_FAILED_NO_HINT = {
  success: false,
  message:
    "Code execution failed: file:///path/to/file.py: name 'undefined_var' is not defined [5:0]",
  details: {
    languageId: 'python',
    variables: [{ id: 'y', title: 'y', type: 'str', isNew: true }],
  },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

describe('runCodeFromUri tool', () => {
  const pythonDiagnostics: vscode.DiagnosticCollection =
    vscode.languages.createDiagnosticCollection('python');

  const pythonWorkspace = {
    getUserFiles: vi.fn(),
  } as unknown as FilteredWorkspace;

  const serverManager = {
    getConnections: vi.fn(),
    getServer: vi.fn(),
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

    vi.mocked(createConnectionNotFoundHint).mockResolvedValue(
      MOCK_CONNECTION_NOT_FOUND_HINT
    );

    vi.mocked(serverManager.getConnections).mockReturnValue([]);
    vi.mocked(serverManager.getServer).mockReturnValue(undefined);
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

  describe('connection validation (getFirstConnectionOrCreate scenarios)', () => {
    beforeEach(() => {
      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue(MOCK_FILE_STAT);
      vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(
        MOCK_DOCUMENT
      );
    });

    it('should error when no connections or server found', async () => {
      vi.mocked(serverManager.getServer).mockReturnValue(undefined);
      vi.mocked(serverManager.getConnections).mockReturnValue([]);

      const tool = createRunCodeFromUriTool({
        pythonDiagnostics,
        pythonWorkspace,
        serverManager,
      });

      const result = await tool.handler({
        uri: MOCK_URI_STRING,
        connectionUrl: MOCK_CONNECTION_URL,
      });

      expect(result.structuredContent).toEqual(
        EXPECTED_NO_CONNECTIONS_OR_SERVER
      );
    });

    it('should error when server is not running', async () => {
      vi.mocked(serverManager.getServer).mockReturnValue(
        MOCK_SERVER_NOT_RUNNING
      );
      vi.mocked(serverManager.getConnections).mockReturnValue([]);

      const tool = createRunCodeFromUriTool({
        pythonDiagnostics,
        pythonWorkspace,
        serverManager,
      });

      const result = await tool.handler({
        uri: MOCK_URI_STRING,
        connectionUrl: MOCK_CONNECTION_URL,
      });

      expect(result.structuredContent).toEqual(EXPECTED_SERVER_NOT_RUNNING);
    });

    it('should error when no active connection for DHE server', async () => {
      vi.mocked(serverManager.getServer).mockReturnValue(MOCK_SERVER_DHE);
      vi.mocked(serverManager.getConnections).mockReturnValue([]);

      const tool = createRunCodeFromUriTool({
        pythonDiagnostics,
        pythonWorkspace,
        serverManager,
      });

      const result = await tool.handler({
        uri: MOCK_URI_STRING,
        connectionUrl: MOCK_CONNECTION_URL,
      });

      expect(result.structuredContent).toEqual(EXPECTED_NO_ACTIVE_CONNECTION);
    });

    it('should error when connection fails after server connection attempt', async () => {
      vi.mocked(serverManager.getServer).mockReturnValue(MOCK_SERVER_RUNNING);
      vi.mocked(serverManager.getConnections)
        .mockReturnValueOnce([])
        .mockReturnValueOnce([]);

      const tool = createRunCodeFromUriTool({
        pythonDiagnostics,
        pythonWorkspace,
        serverManager,
      });

      const result = await tool.handler({
        uri: MOCK_URI_STRING,
        connectionUrl: MOCK_CONNECTION_URL,
      });

      expect(result.structuredContent).toEqual(EXPECTED_FAILED_TO_CONNECT);
      expect(mockExecuteCommand).toHaveBeenCalledWith(CONNECT_TO_SERVER_CMD, {
        type: 'DHC',
        url: new URL('http://localhost:10000'),
      });
    });
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

  describe('code execution', () => {
    const mockConnection: IDhcService = Object.assign(Object.create(DhcService.prototype), {
      serverUrl: new URL('http://localhost:10000'),
      getPsk: vi.fn().mockResolvedValue(undefined),
    });

    beforeEach(() => {
      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue(MOCK_FILE_STAT);
      vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(
        MOCK_DOCUMENT
      );
      vi.mocked(serverManager.getConnections).mockReturnValue([mockConnection]);
      vi.mocked(serverManager.getServer).mockReturnValue(MOCK_SERVER_RUNNING);
      vi.mocked(serverManager.getUriConnection).mockReturnValue(mockConnection);

      vi.mocked(getDiagnosticsErrors).mockReturnValue(MOCK_DIAGNOSTIC_ERRORS);
    });

    it.each([
      {
        name: 'ConnectionNotFoundError with hint',
        cmdResult: new ConnectionNotFoundError(new URL(MOCK_CONNECTION_URL)),
        connectionUrl: MOCK_CONNECTION_URL,
        expected: EXPECTED_CONNECTION_NOT_FOUND,
      },
      {
        name: 'general exceptions during execution',
        cmdResult: new Error('Unexpected error'),
        connectionUrl: MOCK_CONNECTION_URL,
        expected: EXPECTED_GENERAL_ERROR,
      },
      {
        name: 'execute code successfully',
        cmdResult: MOCK_RUN_CODE_SUCCESS,
        connectionUrl: MOCK_CONNECTION_URL,
        expected: EXPECTED_SUCCESS,
      },
      {
        name: 'handle code execution failure with Python diagnostics and hint',
        cmdResult: MOCK_RUN_CODE_ERROR,
        connectionUrl: MOCK_CONNECTION_URL,
        pythonHint: MOCK_HINT,
        expected: EXPECTED_CODE_EXECUTION_FAILED,
      },
      {
        name: 'handle code execution failure with Python diagnostics without hint',
        cmdResult: MOCK_RUN_CODE_ERROR,
        connectionUrl: MOCK_CONNECTION_URL,
        pythonHint: undefined,
        expected: EXPECTED_CODE_EXECUTION_FAILED_NO_HINT,
      },
    ])(
      'should $name',
      async ({ cmdResult, connectionUrl, pythonHint, expected }) => {
        if (cmdResult instanceof Error) {
          vi.mocked(vscode.commands.executeCommand).mockRejectedValue(
            cmdResult
          );
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

        expect(result.structuredContent).toEqual(expected);
      }
    );
  });
});
