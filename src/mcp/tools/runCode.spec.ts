import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createRunCodeTool } from './runCode';
import type {
  IServerManager,
  ServerState,
  VariableDefintion,
} from '../../types';
import {
  createMockDhcService,
  fakeMcpToolTimings,
  mcpErrorResult,
  mcpSuccessResult,
} from '../utils/mcpTestUtils';
import { createConnectionNotFoundHint } from '../utils';
import { DhcService } from '../../services';
import { CONNECT_TO_SERVER_CMD } from '../../common';

vi.mock('vscode');

const MOCK_CODE = 'mock.code' as const;
const MOCK_CONNECTION_URL = new URL('http://localhost:10000/');
const MOCK_PANEL_URL_FORMAT =
  MOCK_CONNECTION_URL.origin + '/iframe/widget/?name=<variableTitle>';
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

const MOCK_INT_VARIABLE = {
  id: 'x',
  title: 'x',
  type: 'int',
} as VariableDefintion;

const MOCK_STR_VARIABLE = {
  id: 'y',
  title: 'y',
  type: 'str',
} as VariableDefintion;

const MOCK_RUN_CODE_ERROR = {
  error: 'NameError: name "undefined_var" is not defined',
  changes: {
    created: [MOCK_STR_VARIABLE],
    updated: [],
    removed: [],
  },
} as DhcType.ide.CommandResult;

const MOCK_RUN_CODE_SUCCESS_WITH_VARIABLES = {
  error: '',
  changes: {
    created: [MOCK_INT_VARIABLE],
    updated: [],
    removed: [],
  },
} as DhcType.ide.CommandResult;

const MOCK_DHC_SERVICE_CONNECTION_WITH_VARIABLES: DhcService =
  createMockDhcService({ runCode: MOCK_RUN_CODE_SUCCESS_WITH_VARIABLES });

const EXPECTED_SUCCESS_WITH_VARIABLES = mcpSuccessResult(
  'Code executed successfully',
  {
    panelUrlFormat: MOCK_PANEL_URL_FORMAT,
    variables: [{ id: 'x', title: 'x', type: 'int', isNew: true }],
  }
);

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

    fakeMcpToolTimings();

    mockExecuteCommand.mockResolvedValue(undefined);
    vi.mocked(vscode.commands.executeCommand).mockImplementation(
      mockExecuteCommand
    );

    vi.mocked(serverManager.getConnections).mockReturnValue([]);
    vi.mocked(serverManager.getServer).mockReturnValue(undefined);
    vi.mocked(serverManager.getDheServiceForWorker).mockResolvedValue(null);
    vi.mocked(serverManager.getWorkerInfo).mockResolvedValue(undefined);
  });

  it('should return correct tool spec', () => {
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
      expected: mcpErrorResult(
        `Invalid languageId: 'javascript'. Must be "python" or "groovy".`
      ),
      expectHint: false,
    },
    {
      scenario: 'invalid URL',
      languageId: 'python',
      connectionUrl: 'not-a-url',
      connections: [],
      server: undefined,
      expected: mcpErrorResult('Invalid URL: Invalid URL', {
        connectionUrl: 'not-a-url',
      }),
      expectHint: false,
    },
    {
      scenario: 'no connections or server found',
      languageId: 'python',
      connectionUrl: MOCK_CONNECTION_URL.href,
      connections: [],
      server: undefined,
      expected: mcpErrorResult('No connections or server found', {
        connectionUrl: MOCK_CONNECTION_URL.href,
      }),
      expectHint: true,
    },
    {
      scenario: 'server exists but is not running',
      languageId: 'python',
      connectionUrl: MOCK_CONNECTION_URL.href,
      connections: [],
      server: MOCK_SERVER_NOT_RUNNING,
      expected: mcpErrorResult('Server is not running', {
        connectionUrl: MOCK_CONNECTION_URL.href,
      }),
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
      const mockConnection = createMockDhcService({
        runCode: MOCK_RUN_CODE_ERROR,
      });

      vi.mocked(serverManager.getConnections).mockReturnValue([mockConnection]);
      vi.mocked(serverManager.getServer).mockReturnValue(MOCK_SERVER_RUNNING);

      const tool = createRunCodeTool({ serverManager });
      const result = await tool.handler(MOCK_HANDLER_ARGS);

      expect(result.structuredContent).toEqual(
        mcpErrorResult(
          'Code execution failed: NameError: name "undefined_var" is not defined',
          {
            languageId: 'python',
            panelUrlFormat: MOCK_PANEL_URL_FORMAT,
            variables: [{ id: 'y', title: 'y', type: 'str', isNew: true }],
          }
        )
      );
    });

    it('should handle exceptions during execution', async () => {
      const error = new Error('Unexpected error');
      vi.mocked(serverManager.getConnections).mockImplementation(() => {
        throw error;
      });

      const tool = createRunCodeTool({ serverManager });
      const result = await tool.handler(MOCK_HANDLER_ARGS);

      expect(result.structuredContent).toEqual(
        mcpErrorResult('Failed to execute code: Unexpected error', {
          languageId: 'python',
        })
      );
    });

    it('should error when connection fails after server connection attempt', async () => {
      vi.mocked(serverManager.getConnections)
        .mockReturnValueOnce([])
        .mockReturnValueOnce([]);
      vi.mocked(serverManager.getServer).mockReturnValue(MOCK_SERVER_RUNNING);

      const tool = createRunCodeTool({ serverManager });
      const result = await tool.handler(MOCK_HANDLER_ARGS);

      expect(result.structuredContent).toEqual(
        mcpErrorResult('Failed to connect to server', {
          connectionUrl: MOCK_CONNECTION_URL.href,
        })
      );
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
