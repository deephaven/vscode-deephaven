import type { dh as DhcType } from '@deephaven/jsapi-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createRunCodeTool } from './runCode';
import type { IServerManager, VariableDefintion } from '../../types';
import {
  createMockDhcService,
  fakeMcpToolTimings,
  mcpErrorResult,
  mcpSuccessResult,
} from '../utils/mcpTestUtils';
import { getFirstConnectionOrCreate } from '../utils/serverUtils';

vi.mock('vscode');
vi.mock('../utils/serverUtils', async () => {
  const actual = await vi.importActual('../utils/serverUtils');
  return {
    ...actual,
    getFirstConnectionOrCreate: vi.fn(),
  };
});

const MOCK_CODE = 'mock.code' as const;
const MOCK_CONNECTION_URL = new URL('http://localhost:10000/');
const MOCK_PANEL_URL_FORMAT =
  MOCK_CONNECTION_URL.origin + '/iframe/widget/?name=<variableTitle>';

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
} as unknown as DhcType.ide.CommandResult;

const MOCK_RUN_CODE_SUCCESS_WITH_VARIABLES = {
  error: '',
  changes: {
    created: [MOCK_INT_VARIABLE],
    updated: [],
    removed: [],
  },
} as unknown as DhcType.ide.CommandResult;

describe('runCode tool', () => {
  const serverManager: IServerManager = {
    getConnections: vi.fn(),
    getServer: vi.fn(),
    getDheServiceForWorker: vi.fn(),
    getWorkerInfo: vi.fn(),
  } as unknown as IServerManager;

  const connectionController = {
    onPromptUserToSelectConnection: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fakeMcpToolTimings();
  });

  it('should return correct tool spec', () => {
    const tool = createRunCodeTool({ connectionController, serverManager });
    expect(tool.name).toBe('runCode');
    expect(tool.spec.title).toBe('Run Deephaven Code');
    expect(tool.spec.description).toBe(
      'Execute arbitrary code text in a Deephaven session. Use this for ad-hoc script execution. For running code from workspace files, use runCodeFromUri instead.'
    );
  });

  describe('input validation', () => {
    it('should return error for invalid languageId', async () => {
      const tool = createRunCodeTool({ connectionController, serverManager });
      const result = await tool.handler({
        code: MOCK_CODE,
        languageId: 'javascript',
        connectionUrl: MOCK_CONNECTION_URL.href,
      });

      expect(result.structuredContent).toEqual(
        mcpErrorResult(
          `Invalid languageId: 'javascript'. Must be "python" or "groovy".`
        )
      );
      expect(getFirstConnectionOrCreate).not.toHaveBeenCalled();
    });

    it('should return error for invalid URL', async () => {
      const tool = createRunCodeTool({ connectionController, serverManager });
      const result = await tool.handler({
        code: MOCK_CODE,
        languageId: 'python',
        connectionUrl: 'not-a-url',
      });

      expect(result.structuredContent).toEqual(
        mcpErrorResult('Invalid URL: Invalid URL', {
          connectionUrl: 'not-a-url',
        })
      );
      expect(getFirstConnectionOrCreate).not.toHaveBeenCalled();
    });
  });

  describe('connection handling', () => {
    it('should call getFirstConnectionOrCreate with correct params', async () => {
      const mockConnection = createMockDhcService({
        runCode: MOCK_RUN_CODE_SUCCESS_WITH_VARIABLES,
      });

      vi.mocked(getFirstConnectionOrCreate).mockResolvedValue({
        success: true,
        connection: mockConnection,
        panelUrlFormat: MOCK_PANEL_URL_FORMAT,
      });

      const tool = createRunCodeTool({ connectionController, serverManager });
      await tool.handler({
        code: MOCK_CODE,
        languageId: 'python',
        connectionUrl: MOCK_CONNECTION_URL.href,
      });

      expect(getFirstConnectionOrCreate).toHaveBeenCalledWith({
        serverManager,
        connectionUrl: MOCK_CONNECTION_URL,
        languageId: 'python',
        promptUserToSelectConnection: expect.any(Function),
      });
    });

    it('should return error when connection establishment fails', async () => {
      const errorMessage = 'No connections or server found';
      const hint = 'No available connections supporting languageId python.';

      vi.mocked(getFirstConnectionOrCreate).mockResolvedValue({
        success: false,
        errorMessage,
        hint,
        details: { connectionUrl: MOCK_CONNECTION_URL.href },
      });

      const tool = createRunCodeTool({ connectionController, serverManager });
      const result = await tool.handler({
        code: MOCK_CODE,
        languageId: 'python',
        connectionUrl: MOCK_CONNECTION_URL.href,
      });

      expect(result.structuredContent).toEqual(
        mcpErrorResult(
          errorMessage,
          { connectionUrl: MOCK_CONNECTION_URL.href },
          hint
        )
      );
    });
  });

  describe('code execution', () => {
    it.each([
      {
        name: 'python',
        languageId: 'python',
        runCodeResult: MOCK_RUN_CODE_SUCCESS_WITH_VARIABLES,
        expected: mcpSuccessResult('Code executed successfully', {
          panelUrlFormat: MOCK_PANEL_URL_FORMAT,
          variables: [{ id: 'x', title: 'x', type: 'int', isNew: true }],
        }),
      },
      {
        name: 'groovy',
        languageId: 'groovy',
        runCodeResult: MOCK_RUN_CODE_SUCCESS_WITH_VARIABLES,
        expected: mcpSuccessResult('Code executed successfully', {
          panelUrlFormat: MOCK_PANEL_URL_FORMAT,
          variables: [{ id: 'x', title: 'x', type: 'int', isNew: true }],
        }),
      },
    ])(
      'should execute $name code successfully',
      async ({ languageId, runCodeResult, expected }) => {
        const mockConnection = createMockDhcService({
          runCode: runCodeResult,
        });

        vi.mocked(getFirstConnectionOrCreate).mockResolvedValue({
          success: true,
          connection: mockConnection,
          panelUrlFormat: MOCK_PANEL_URL_FORMAT,
        });

        const tool = createRunCodeTool({ connectionController, serverManager });
        const result = await tool.handler({
          code: MOCK_CODE,
          languageId,
          connectionUrl: MOCK_CONNECTION_URL.href,
        });

        expect(mockConnection.runCode).toHaveBeenCalledWith(
          MOCK_CODE,
          languageId
        );
        expect(result.structuredContent).toEqual(expected);
      }
    );

    it('should return error when code execution fails', async () => {
      const mockConnection = createMockDhcService({
        runCode: MOCK_RUN_CODE_ERROR,
      });

      vi.mocked(getFirstConnectionOrCreate).mockResolvedValue({
        success: true,
        connection: mockConnection,
        panelUrlFormat: MOCK_PANEL_URL_FORMAT,
      });

      const tool = createRunCodeTool({ connectionController, serverManager });
      const result = await tool.handler({
        code: MOCK_CODE,
        languageId: 'python',
        connectionUrl: MOCK_CONNECTION_URL.href,
      });

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
      const mockConnection = createMockDhcService({
        runCode: MOCK_RUN_CODE_SUCCESS_WITH_VARIABLES,
      });
      vi.mocked(mockConnection.runCode).mockRejectedValue(
        new Error('Unexpected error')
      );

      vi.mocked(getFirstConnectionOrCreate).mockResolvedValue({
        success: true,
        connection: mockConnection,
        panelUrlFormat: MOCK_PANEL_URL_FORMAT,
      });

      const tool = createRunCodeTool({ connectionController, serverManager });
      const result = await tool.handler({
        code: MOCK_CODE,
        languageId: 'python',
        connectionUrl: MOCK_CONNECTION_URL.href,
      });

      expect(result.structuredContent).toEqual(
        mcpErrorResult('Failed to execute code: Unexpected error', {
          languageId: 'python',
        })
      );
    });
  });
});
