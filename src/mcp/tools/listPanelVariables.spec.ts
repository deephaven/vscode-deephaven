import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { createListPanelVariablesTool } from './listPanelVariables';
import type {
  IPanelService,
  IServerManager,
  ServerState,
  VariableDefintion,
} from '../../types';
import { McpToolResponse } from '../utils/mcpUtils';

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

const MOCK_SERVER_DHC: ServerState = {
  url: MOCK_PARSED_URL,
  type: 'DHC',
  isRunning: true,
  isConnected: false,
  connectionCount: 0,
};

const MOCK_SERVER_DHE: ServerState = {
  url: MOCK_PARSED_URL,
  type: 'DHE',
  isRunning: true,
  isConnected: false,
  connectionCount: 0,
};

const EXPECTED_SUCCESS = {
  success: true,
  message: 'Found 2 panel variable(s)',
  details: {
    variables: MOCK_VARIABLES.map(({ id, title, type }) => ({
      id,
      title,
      type,
    })),
  },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_SUCCESS_WITH_HINT = {
  success: true,
  message: 'Found 2 panel variable(s)',
  hint: `Variables can be accessed via panel URLs in the format: ${MOCK_PARSED_URL.origin}/iframe/widget/?name=<variableTitle>`,
  details: {
    variables: MOCK_VARIABLES.map(({ id, title, type }) => ({
      id,
      title,
      type,
    })),
  },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_NO_VARIABLES = {
  success: true,
  message: 'Found 0 panel variable(s)',
  details: {
    variables: [],
  },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_INVALID_URL = {
  success: false,
  message: 'Invalid URL: Invalid URL',
  details: { url: 'invalid-url' },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_SERVER_NOT_FOUND = {
  success: false,
  message: 'Server not found',
  hint: 'Use listServers to see available servers',
  details: { url: MOCK_URL },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_NO_CONNECTION_DHE = {
  success: false,
  message: 'No active connection',
  hint: 'Use connectToServer first',
  details: { url: MOCK_URL },
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
      'List all panel variables for a given Deephaven connection URL.'
    );
  });

  it('should list panel variables when DHC connection exists', async () => {
    vi.mocked(serverManager.getConnections).mockReturnValue([{} as any] as any);
    vi.mocked(serverManager.getServer).mockReturnValue(MOCK_SERVER_DHC);
    vi.mocked(panelService.getVariables).mockReturnValue(MOCK_VARIABLES);

    const tool = createListPanelVariablesTool({ panelService, serverManager });
    const result = await tool.handler({ url: MOCK_URL });

    expect(serverManager.getConnections).toHaveBeenCalledWith(MOCK_PARSED_URL);
    expect(panelService.getVariables).toHaveBeenCalledWith(MOCK_PARSED_URL);
    expect(result.structuredContent).toEqual(EXPECTED_SUCCESS_WITH_HINT);
  });

  it('should list panel variables when non-DHC connection exists', async () => {
    vi.mocked(serverManager.getConnections).mockReturnValue([{} as any] as any);
    vi.mocked(serverManager.getServer).mockReturnValue(MOCK_SERVER_DHE);
    vi.mocked(panelService.getVariables).mockReturnValue(MOCK_VARIABLES);

    const tool = createListPanelVariablesTool({ panelService, serverManager });
    const result = await tool.handler({ url: MOCK_URL });

    expect(serverManager.getConnections).toHaveBeenCalledWith(MOCK_PARSED_URL);
    expect(panelService.getVariables).toHaveBeenCalledWith(MOCK_PARSED_URL);
    expect(result.structuredContent).toEqual(EXPECTED_SUCCESS);
  });

  it('should return empty list when no variables exist', async () => {
    vi.mocked(serverManager.getConnections).mockReturnValue([{} as any] as any);
    vi.mocked(serverManager.getServer).mockReturnValue(MOCK_SERVER_DHE);
    vi.mocked(panelService.getVariables).mockReturnValue([]);

    const tool = createListPanelVariablesTool({ panelService, serverManager });
    const result = await tool.handler({ url: MOCK_URL });

    expect(result.structuredContent).toEqual(EXPECTED_NO_VARIABLES);
  });

  it('should auto-connect to DHC server when no connection exists', async () => {
    vi.mocked(serverManager.getConnections).mockReturnValue([]);
    vi.mocked(serverManager.getServer).mockReturnValue(MOCK_SERVER_DHC);
    vi.mocked(panelService.getVariables).mockReturnValue(MOCK_VARIABLES);
    const executeCommand = vi.spyOn(vscode.commands, 'executeCommand');

    const tool = createListPanelVariablesTool({ panelService, serverManager });
    const result = await tool.handler({ url: MOCK_URL });

    expect(serverManager.getServer).toHaveBeenCalledWith(MOCK_PARSED_URL, true);
    expect(executeCommand).toHaveBeenCalledWith(
      'vscode-deephaven.connectToServer',
      {
        type: 'DHC',
        url: MOCK_PARSED_URL,
      }
    );
    expect(result.structuredContent).toEqual(EXPECTED_SUCCESS_WITH_HINT);
  });

  it('should return error for DHE server when no connection exists', async () => {
    vi.mocked(serverManager.getConnections).mockReturnValue([]);
    vi.mocked(serverManager.getServer).mockReturnValue(MOCK_SERVER_DHE);

    const tool = createListPanelVariablesTool({ panelService, serverManager });
    const result = await tool.handler({ url: MOCK_URL });

    expect(result.structuredContent).toEqual(EXPECTED_NO_CONNECTION_DHE);
  });

  it('should return error when server not found', async () => {
    vi.mocked(serverManager.getConnections).mockReturnValue([]);
    vi.mocked(serverManager.getServer).mockReturnValue(undefined);

    const tool = createListPanelVariablesTool({ panelService, serverManager });
    const result = await tool.handler({ url: MOCK_URL });

    expect(result.structuredContent).toEqual(EXPECTED_SERVER_NOT_FOUND);
  });

  it('should handle invalid URL', async () => {
    const tool = createListPanelVariablesTool({ panelService, serverManager });
    const result = await tool.handler({ url: 'invalid-url' });

    expect(result.structuredContent).toEqual(EXPECTED_INVALID_URL);
    expect(serverManager.getConnections).not.toHaveBeenCalled();
  });

  it('should handle errors from panelService', async () => {
    vi.mocked(serverManager.getConnections).mockReturnValue([{} as any] as any);
    vi.mocked(serverManager.getServer).mockReturnValue(MOCK_SERVER_DHE);
    vi.mocked(panelService.getVariables).mockImplementation(() => {
      throw new Error('Test error');
    });

    const tool = createListPanelVariablesTool({ panelService, serverManager });
    const result = await tool.handler({ url: MOCK_URL });

    expect(result.structuredContent).toEqual(EXPECTED_ERROR);
  });
});
