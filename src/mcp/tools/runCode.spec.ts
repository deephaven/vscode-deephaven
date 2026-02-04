import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createRunCodeTool } from './runCode';
import type { ConnectionState, IServerManager, ServerState } from '../../types';
import { McpToolResponse } from '../utils/mcpUtils';
import { createConnectionNotFoundHint } from '../utils';
import { DhcService } from '../../services';
import { CONNECT_TO_SERVER_CMD } from '../../common';

vi.mock('vscode');

const MOCK_EXECUTION_TIME_MS = 100;
const MOCK_CODE = 'mock.code';
const MOCK_CONNECTION_URL = new URL('http://localhost:10000/');
const MOCK_HANDLER_ARGS = {
  code: MOCK_CODE,
  languageId: 'python',
  connectionUrl: MOCK_CONNECTION_URL.href,
} as const;

const MOCK_SERVER_RUNNING: ServerState = {
  isRunning: true,
  type: 'DHC',
  url: MOCK_CONNECTION_URL,
  isConnected: false,
  connectionCount: 0,
};

const MOCK_SERVER_NOT_RUNNING: ServerState = {
  isRunning: false,
  type: 'DHC',
  url: MOCK_CONNECTION_URL,
  isConnected: false,
  connectionCount: 0,
};

const MOCK_RUN_CODE_ERROR = {
  error: 'NameError: name "undefined_var" is not defined',
  changes: {
    created: [{ id: 'y', title: 'y', type: 'str' }],
    updated: [],
  },
} as const;

const MOCK_RUN_CODE_SUCCESS_WITH_VARIABLES = {
  error: null,
  changes: {
    created: [{ id: 'x', title: 'x', type: 'int' }],
    updated: [],
  },
} as const;

const MOCK_DHC_SERVICE_CONNECTION_WITH_VARIABLES: DhcService = Object.assign(
  Object.create(DhcService.prototype),
  {
    runCode: vi.fn().mockResolvedValue(MOCK_RUN_CODE_SUCCESS_WITH_VARIABLES),
    supportsConsoleType: vi.fn().mockReturnValue(true),
  }
);

const EXPECTED_INVALID_LANGUAGE = {
  success: false,
  message: `Invalid languageId: 'javascript'. Must be "python" or "groovy".`,
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
};

const EXPECTED_INVALID_URL = {
  success: false,
  message: 'Invalid URL: Invalid URL',
  details: { connectionUrl: 'not-a-url' },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_NO_CONNECTION_OR_SERVER = {
  success: false,
  message: 'No connections or server found',
  details: { connectionUrl: MOCK_CONNECTION_URL.href },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_SERVER_NOT_RUNNING = {
  success: false,
  message: 'Server is not running',
  details: { connectionUrl: MOCK_CONNECTION_URL.href },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_SUCCESS_WITH_VARIABLES = {
  success: true,
  message: 'Code executed successfully',
  details: {
    panelUrlFormat:
      MOCK_CONNECTION_URL.origin + '/iframe/widget/?name=<variableTitle>',
    variables: [{ id: 'x', title: 'x', type: 'int', isNew: true }],
  },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_FAILED_TO_CONNECT = {
  success: false,
  message: 'Failed to connect to server',
  details: { connectionUrl: MOCK_CONNECTION_URL.href },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_CODE_EXECUTION_FAILED = {
  success: false,
  message:
    'Code execution failed: NameError: name "undefined_var" is not defined',
  details: {
    languageId: 'python',
    panelUrlFormat:
      MOCK_CONNECTION_URL.origin + '/iframe/widget/?name=<variableTitle>',
    variables: [{ id: 'y', title: 'y', type: 'str', isNew: true }],
  },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_EXCEPTION_DURING_EXECUTION = {
  success: false,
  message: 'Failed to execute code: Unexpected error',
  details: { languageId: 'python' },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

describe('runCode tool', () => {
  const serverManager: IServerManager = {
    getConnections: vi.fn(),
    getServer: vi.fn(),
    getDheServiceForWorker: vi.fn(),
    getWorkerInfo: vi.fn(),
  } as unknown as IServerManager;

  const mockExecuteCommand = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock getElapsedTimeMs to return a fixed value
    vi.spyOn(McpToolResponse.prototype, 'getElapsedTimeMs').mockReturnValue(
      MOCK_EXECUTION_TIME_MS
    );

    mockExecuteCommand.mockResolvedValue(undefined);
    vi.mocked(vscode.commands.executeCommand).mockImplementation(
      mockExecuteCommand
    );

    vi.mocked(serverManager.getConnections).mockReturnValue([]);
    vi.mocked(serverManager.getServer).mockReturnValue(undefined);
    vi.mocked(serverManager.getDheServiceForWorker).mockResolvedValue(null);
    vi.mocked(serverManager.getWorkerInfo).mockResolvedValue(undefined);
  });

  it('should have correct spec', () => {
    const tool = createRunCodeTool({ serverManager });
    expect(tool.name).toBe('runCode');
    expect(tool.spec.title).toBe('Run Deephaven Code');
    expect(tool.spec.description).toBe(
      'Execute arbitrary code text in a Deephaven session. Use this for ad-hoc script execution. For running code from workspace files, use runCodeFromUri instead.'
    );
  });

  it.each([
    {
      scenario: 'invalid languageId',
      languageId: 'javascript',
      connectionUrl: MOCK_CONNECTION_URL.href,
      connections: [],
      server: undefined,
      expected: EXPECTED_INVALID_LANGUAGE,
      expectHint: false,
    },
    {
      scenario: 'invalid URL',
      languageId: 'python',
      connectionUrl: 'not-a-url',
      connections: [],
      server: undefined,
      expected: EXPECTED_INVALID_URL,
      expectHint: false,
    },
    {
      scenario: 'no connections or server found',
      languageId: 'python',
      connectionUrl: MOCK_CONNECTION_URL.href,
      connections: [],
      server: undefined,
      expected: EXPECTED_NO_CONNECTION_OR_SERVER,
      expectHint: true,
    },
    {
      scenario: 'server exists but is not running',
      languageId: 'python',
      connectionUrl: MOCK_CONNECTION_URL.href,
      connections: [],
      server: MOCK_SERVER_NOT_RUNNING,
      expected: EXPECTED_SERVER_NOT_RUNNING,
      expectHint: false,
    },
    {
      scenario: 'code executes successfully (python)',
      languageId: 'python',
      connectionUrl: MOCK_CONNECTION_URL.href,
      connections: [MOCK_DHC_SERVICE_CONNECTION_WITH_VARIABLES],
      server: MOCK_SERVER_RUNNING,
      expected: EXPECTED_SUCCESS_WITH_VARIABLES,
      expectHint: false,
    },
    {
      scenario: 'code executes successfully (groovy)',
      languageId: 'groovy',
      connectionUrl: MOCK_CONNECTION_URL.href,
      connections: [MOCK_DHC_SERVICE_CONNECTION_WITH_VARIABLES],
      server: MOCK_SERVER_RUNNING,
      expected: EXPECTED_SUCCESS_WITH_VARIABLES,
      expectHint: false,
    },
  ])(
    'should handle $scenario',
    async ({
      languageId,
      connectionUrl,
      connections,
      server,
      expected,
      expectHint,
    }) => {
      vi.mocked(serverManager.getConnections).mockReturnValue(connections);
      vi.mocked(serverManager.getServer).mockReturnValue(server);

      const tool = createRunCodeTool({ serverManager });
      const result = await tool.handler({
        code: MOCK_CODE,
        languageId,
        connectionUrl,
      });

      if (expected.success) {
        expect(
          MOCK_DHC_SERVICE_CONNECTION_WITH_VARIABLES.runCode
        ).toHaveBeenCalledWith(MOCK_CODE, languageId);
      } else {
        expect(
          MOCK_DHC_SERVICE_CONNECTION_WITH_VARIABLES.runCode
        ).not.toHaveBeenCalled();
      }

      const hint = expectHint
        ? await createConnectionNotFoundHint(
            serverManager,
            connectionUrl,
            languageId
          )
        : undefined;

      expect(result.structuredContent).toEqual({
        ...expected,
        hint,
      });
    }
  );

  describe('error handling', () => {
    it('should error when code execution fails with error', async () => {
      const mockConnection = Object.create(DhcService.prototype);
      mockConnection.runCode = vi.fn().mockResolvedValue(MOCK_RUN_CODE_ERROR);
      mockConnection.supportsConsoleType = vi.fn().mockReturnValue(true);

      vi.mocked(serverManager.getConnections).mockReturnValue([mockConnection]);
      vi.mocked(serverManager.getServer).mockReturnValue(MOCK_SERVER_RUNNING);

      const tool = createRunCodeTool({ serverManager });
      const result = await tool.handler(MOCK_HANDLER_ARGS);

      expect(result.structuredContent).toEqual(EXPECTED_CODE_EXECUTION_FAILED);
    });

    it('should handle exceptions during execution', async () => {
      const error = new Error('Unexpected error');
      vi.mocked(serverManager.getConnections).mockImplementation(() => {
        throw error;
      });

      const tool = createRunCodeTool({ serverManager });
      const result = await tool.handler(MOCK_HANDLER_ARGS);

      expect(result.structuredContent).toEqual(
        EXPECTED_EXCEPTION_DURING_EXECUTION
      );
    });

    it('should error when connection fails after server connection attempt', async () => {
      vi.mocked(serverManager.getConnections)
        .mockReturnValueOnce([])
        .mockReturnValueOnce([]);
      vi.mocked(serverManager.getServer).mockReturnValue(MOCK_SERVER_RUNNING);

      const tool = createRunCodeTool({ serverManager });
      const result = await tool.handler(MOCK_HANDLER_ARGS);

      expect(result.structuredContent).toEqual(EXPECTED_FAILED_TO_CONNECT);
      expect(mockExecuteCommand).toHaveBeenCalledWith(CONNECT_TO_SERVER_CMD, {
        type: 'DHC',
        url: MOCK_CONNECTION_URL,
      });
    });
  });

  describe('success scenarios', () => {
    it('should execute code successfully with existing connection', async () => {
      vi.mocked(serverManager.getConnections).mockReturnValue([
        MOCK_DHC_SERVICE_CONNECTION_WITH_VARIABLES,
      ]);
      vi.mocked(serverManager.getServer).mockReturnValue(MOCK_SERVER_RUNNING);

      const tool = createRunCodeTool({ serverManager });
      const result = await tool.handler(MOCK_HANDLER_ARGS);

      expect(result.structuredContent).toEqual(EXPECTED_SUCCESS_WITH_VARIABLES);
    });

    it('should connect to server and execute code when no existing connection', async () => {
      vi.mocked(serverManager.getConnections)
        .mockReturnValueOnce([])
        .mockReturnValueOnce([MOCK_DHC_SERVICE_CONNECTION_WITH_VARIABLES]);

      vi.mocked(serverManager.getServer).mockReturnValue(MOCK_SERVER_RUNNING);

      const tool = createRunCodeTool({ serverManager });
      const result = await tool.handler(MOCK_HANDLER_ARGS);

      expect(result.structuredContent).toEqual(EXPECTED_SUCCESS_WITH_VARIABLES);

      expect(mockExecuteCommand).toHaveBeenCalledWith(CONNECT_TO_SERVER_CMD, {
        type: 'DHC',
        url: MOCK_CONNECTION_URL,
      });
    });
  });
});
