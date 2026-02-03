import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createListPanelVariablesTool } from './listPanelVariables';
import type {
  IPanelService,
  IServerManager,
  VariableDefintion,
} from '../../types';
import { McpToolResponse } from '../utils/mcpUtils';
import * as mcpUtils from '../utils/mcpUtils';

vi.mock('vscode');

const MOCK_EXECUTION_TIME_MS = 100;

const MOCK_URL = 'http://localhost:10000';
const MOCK_PARSED_URL = new URL(MOCK_URL);

const MOCK_VARIABLES: VariableDefintion[] = [
  {
    id: 'var1',
    title: 'Table 1',
    type: 'Table',
  } as unknown as VariableDefintion,
  {
    id: 'var2',
    title: 'Plot 1',
    type: 'Table',
  } as unknown as VariableDefintion,
];

const DHC_PANEL_URL_FORMAT = `${MOCK_PARSED_URL.origin}/iframe/widget/?name=<variableTitle>`;
const DHE_PANEL_URL_FORMAT = `${MOCK_PARSED_URL.origin}/ide/widgets/?worker=<worker>&name=<variableTitle>`;

const EXPECTED_SUCCESS_DHC = {
  success: true,
  message: 'Found 2 panel variable(s)',
  details: {
    panelUrlFormat: DHC_PANEL_URL_FORMAT,
    variables: MOCK_VARIABLES.map(({ id, title, type }) => ({
      id,
      title,
      type,
    })),
  },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_SUCCESS_DHE = {
  success: true,
  message: 'Found 2 panel variable(s)',
  details: {
    panelUrlFormat: DHE_PANEL_URL_FORMAT,
    variables: MOCK_VARIABLES.map(({ id, title, type }) => ({
      id,
      title,
      type,
    })),
  },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_NO_VARIABLES_DHC = {
  success: true,
  message: 'Found 0 panel variable(s)',
  details: {
    panelUrlFormat: DHC_PANEL_URL_FORMAT,
    variables: [],
  },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_NO_VARIABLES_DHE = {
  success: true,
  message: 'Found 0 panel variable(s)',
  details: {
    panelUrlFormat: DHE_PANEL_URL_FORMAT,
    variables: [],
  },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_INVALID_URL = {
  success: false,
  message: 'Invalid URL: Invalid URL',
  details: { connectionUrl: 'invalid-url' },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_SERVER_NOT_FOUND = {
  success: false,
  message: 'No connections or server found',
  details: { connectionUrl: MOCK_URL },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_SERVER_NOT_RUNNING = {
  success: false,
  message: 'Server is not running',
  details: { connectionUrl: MOCK_URL },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_NO_CONNECTION_DHE = {
  success: false,
  message: 'No active connection',
  hint: 'Use connectToServer first',
  details: { connectionUrl: MOCK_URL },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_FAILED_TO_CONNECT = {
  success: false,
  message: 'Failed to connect to server',
  details: { connectionUrl: MOCK_URL },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_ERROR = {
  success: false,
  message: 'Failed to list panel variables: Test error',
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

describe('listPanelVariables', () => {
  const panelService = {
    getVariables: vi.fn(),
  } as unknown as IPanelService;

  const serverManager = {
    getConnections: vi.fn(),
    getServer: vi.fn(),
  } as unknown as IServerManager;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(McpToolResponse.prototype, 'getElapsedTimeMs').mockReturnValue(
      MOCK_EXECUTION_TIME_MS
    );
  });

  it('should return correct tool spec', () => {
    const tool = createListPanelVariablesTool({ panelService, serverManager });

    expect(tool.name).toBe('listPanelVariables');
    expect(tool.spec.title).toBe('List Panel Variables');
    expect(tool.spec.description).toBe(
      'List all panel variables for a given Deephaven connection URL. The response includes a panelUrlFormat in the details to construct panel URLs.'
    );
  });

  it.each([
    {
      serverType: 'DHC',
      panelUrlFormat: DHC_PANEL_URL_FORMAT,
      expected: EXPECTED_SUCCESS_DHC,
    },
    {
      serverType: 'DHE',
      panelUrlFormat: DHE_PANEL_URL_FORMAT,
      expected: EXPECTED_SUCCESS_DHE,
    },
  ])(
    'should list panel variables for $serverType server with connection',
    async ({ panelUrlFormat, expected }) => {
      const getFirstConnectionOrCreateSpy = vi
        .spyOn(mcpUtils, 'getFirstConnectionOrCreate')
        .mockResolvedValue({
          success: true,
          connection: {} as any,
          panelUrlFormat,
        });
      vi.mocked(panelService.getVariables).mockReturnValue(MOCK_VARIABLES);

      const tool = createListPanelVariablesTool({
        panelService,
        serverManager,
      });
      const result = await tool.handler({ connectionUrl: MOCK_URL });

      expect(getFirstConnectionOrCreateSpy).toHaveBeenCalledWith({
        connectionUrl: MOCK_PARSED_URL,
        serverManager,
      });
      expect(panelService.getVariables).toHaveBeenCalledWith(MOCK_PARSED_URL);
      expect(result.structuredContent).toEqual(expected);
    }
  );

  it.each([
    {
      serverType: 'DHC',
      panelUrlFormat: DHC_PANEL_URL_FORMAT,
      expected: EXPECTED_NO_VARIABLES_DHC,
    },
    {
      serverType: 'DHE',
      panelUrlFormat: DHE_PANEL_URL_FORMAT,
      expected: EXPECTED_NO_VARIABLES_DHE,
    },
  ])(
    'should return empty list for $serverType server when no variables exist',
    async ({ panelUrlFormat, expected }) => {
      const getFirstConnectionOrCreateSpy = vi
        .spyOn(mcpUtils, 'getFirstConnectionOrCreate')
        .mockResolvedValue({
          success: true,
          connection: {} as any,
          panelUrlFormat,
        });
      vi.mocked(panelService.getVariables).mockReturnValue([]);

      const tool = createListPanelVariablesTool({
        panelService,
        serverManager,
      });
      const result = await tool.handler({ connectionUrl: MOCK_URL });

      expect(getFirstConnectionOrCreateSpy).toHaveBeenCalledWith({
        connectionUrl: MOCK_PARSED_URL,
        serverManager,
      });
      expect(result.structuredContent).toEqual(expected);
    }
  );

  it.each([
    {
      scenario: 'server not found',
      errorMessage: 'No connections or server found',
      expected: EXPECTED_SERVER_NOT_FOUND,
    },
    {
      scenario: 'server is not running',
      errorMessage: 'Server is not running',
      expected: EXPECTED_SERVER_NOT_RUNNING,
    },
    {
      scenario: 'DHE server when no connection exists',
      errorMessage: 'No active connection',
      hint: 'Use connectToServer first',
      expected: EXPECTED_NO_CONNECTION_DHE,
    },
    {
      scenario: 'DHC auto-connect fails',
      errorMessage: 'Failed to connect to server',
      expected: EXPECTED_FAILED_TO_CONNECT,
    },
  ])(
    'should return error when $scenario',
    async ({ errorMessage, hint, expected }) => {
      const getFirstConnectionOrCreateSpy = vi
        .spyOn(mcpUtils, 'getFirstConnectionOrCreate')
        .mockResolvedValue({
          success: false,
          errorMessage,
          ...(hint && { hint }),
          details: { connectionUrl: MOCK_URL },
        });

      const tool = createListPanelVariablesTool({
        panelService,
        serverManager,
      });
      const result = await tool.handler({ connectionUrl: MOCK_URL });

      expect(getFirstConnectionOrCreateSpy).toHaveBeenCalledWith({
        connectionUrl: MOCK_PARSED_URL,
        serverManager,
      });
      expect(result.structuredContent).toEqual(expected);
      expect(panelService.getVariables).not.toHaveBeenCalled();
    }
  );

  it('should handle invalid URL', async () => {
    const tool = createListPanelVariablesTool({ panelService, serverManager });
    const result = await tool.handler({ connectionUrl: 'invalid-url' });

    expect(result.structuredContent).toEqual(EXPECTED_INVALID_URL);
    expect(panelService.getVariables).not.toHaveBeenCalled();
  });

  it('should handle errors from panelService', async () => {
    vi.spyOn(mcpUtils, 'getFirstConnectionOrCreate').mockResolvedValue({
      success: true,
      connection: {} as any,
      panelUrlFormat: DHC_PANEL_URL_FORMAT,
    });
    vi.mocked(panelService.getVariables).mockImplementation(() => {
      throw new Error('Test error');
    });

    const tool = createListPanelVariablesTool({ panelService, serverManager });
    const result = await tool.handler({ connectionUrl: MOCK_URL });

    expect(result.structuredContent).toEqual(EXPECTED_ERROR);
  });
});
