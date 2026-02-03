import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenVariablePanelsTool } from './openVariablePanels';
import type { IServerManager, ServerState } from '../../types';
import { McpToolResponse } from '../utils/mcpUtils';
import {
  execConnectToServer,
  execOpenVariablePanels,
} from '../../common/commands';

vi.mock('vscode');
vi.mock('../../common/commands');

const MOCK_EXECUTION_TIME_MS = 100;

const MOCK_URL = 'http://localhost:10000';
const MOCK_PARSED_URL = new URL(MOCK_URL);

const MOCK_VARIABLES = [
  { id: 'var1', title: 'Table 1', type: 'Table' },
  { id: 'var2', title: 'Plot 1', type: 'Plot' },
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
  message: 'Variable panels opened successfully',
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
  message: 'Server not found',
  hint: 'Use listServers to see available servers',
  details: { connectionUrl: MOCK_URL },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_FAILED_TO_CONNECT = {
  success: false,
  message: 'Failed to connect to server',
  details: { connectionUrl: MOCK_URL },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_NO_VARIABLES = {
  success: false,
  message: 'No variables provided',
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

const EXPECTED_ERROR = {
  success: false,
  message: 'Failed to open variable panels: Test error',
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

describe('openVariablePanels', () => {
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
    const tool = createOpenVariablePanelsTool({ serverManager });

    expect(tool.name).toBe('openVariablePanels');
    expect(tool.spec.title).toBe('Open Variable Panels');
    expect(tool.spec.description).toBe(
      'Open variable panels for a given connection URL and list of variables.'
    );
  });

  it('should open variable panels when connection exists', async () => {
    vi.mocked(serverManager.getConnections).mockReturnValue([{} as any] as any);

    const tool = createOpenVariablePanelsTool({ serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_URL,
      variables: MOCK_VARIABLES,
    });

    expect(serverManager.getConnections).toHaveBeenCalledWith(MOCK_PARSED_URL);
    expect(execOpenVariablePanels).toHaveBeenCalledWith(
      MOCK_PARSED_URL,
      MOCK_VARIABLES
    );
    expect(result.structuredContent).toEqual(EXPECTED_SUCCESS);
  });

  it('should auto-connect to DHC server when no connection exists', async () => {
    vi.mocked(serverManager.getConnections)
      .mockReturnValueOnce([])
      .mockReturnValueOnce([{} as any] as any);
    vi.mocked(serverManager.getServer).mockReturnValue(MOCK_SERVER_DHC);

    const tool = createOpenVariablePanelsTool({ serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_URL,
      variables: MOCK_VARIABLES,
    });

    expect(serverManager.getServer).toHaveBeenCalledWith(MOCK_PARSED_URL);
    expect(execConnectToServer).toHaveBeenCalledWith({
      type: 'DHC',
      url: MOCK_PARSED_URL,
    });
    expect(execOpenVariablePanels).toHaveBeenCalledWith(
      MOCK_PARSED_URL,
      MOCK_VARIABLES
    );
    expect(result.structuredContent).toEqual(EXPECTED_SUCCESS);
  });

  it('should return error when no variables provided', async () => {
    const tool = createOpenVariablePanelsTool({ serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_URL,
      variables: [],
    });

    expect(result.structuredContent).toEqual(EXPECTED_NO_VARIABLES);
    expect(serverManager.getConnections).not.toHaveBeenCalled();
  });

  it.each([
    {
      scenario: 'DHC auto-connect fails',
      setupMocks: (): void => {
        vi.mocked(serverManager.getConnections).mockReturnValue([]);
        vi.mocked(serverManager.getServer).mockReturnValue(MOCK_SERVER_DHC);
      },
      expected: EXPECTED_FAILED_TO_CONNECT,
    },
    {
      scenario: 'DHE server when no connection exists',
      setupMocks: (): void => {
        vi.mocked(serverManager.getConnections).mockReturnValue([]);
        vi.mocked(serverManager.getServer).mockReturnValue(MOCK_SERVER_DHE);
      },
      expected: EXPECTED_NO_CONNECTION_DHE,
    },
    {
      scenario: 'server not found',
      setupMocks: (): void => {
        vi.mocked(serverManager.getConnections).mockReturnValue([]);
        vi.mocked(serverManager.getServer).mockReturnValue(undefined);
      },
      expected: EXPECTED_SERVER_NOT_FOUND,
    },
  ])('should return error when $scenario', async ({ setupMocks, expected }) => {
    setupMocks();

    const tool = createOpenVariablePanelsTool({ serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_URL,
      variables: MOCK_VARIABLES,
    });

    expect(result.structuredContent).toEqual(expected);
  });

  it('should handle invalid URL', async () => {
    const tool = createOpenVariablePanelsTool({ serverManager });
    const result = await tool.handler({
      connectionUrl: 'invalid-url',
      variables: MOCK_VARIABLES,
    });

    expect(result.structuredContent).toEqual(EXPECTED_INVALID_URL);
    expect(serverManager.getConnections).not.toHaveBeenCalled();
  });

  it('should handle errors from execOpenVariablePanels', async () => {
    vi.mocked(serverManager.getConnections).mockReturnValue([{} as any] as any);
    vi.mocked(execOpenVariablePanels).mockRejectedValue(
      new Error('Test error')
    );

    const tool = createOpenVariablePanelsTool({ serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_URL,
      variables: MOCK_VARIABLES,
    });

    expect(result.structuredContent).toEqual(EXPECTED_ERROR);
  });
});
