import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenVariablePanelsTool } from './openVariablePanels';
import type { IServerManager } from '../../types';
import { getFirstConnectionOrCreate, McpToolResponse } from '../utils/mcpUtils';
import {
  mcpErrorResult,
  mcpSuccessResult,
  MOCK_EXECUTION_TIME_MS,
} from '../utils/mcpTestUtils';
import { execOpenVariablePanels } from '../../common/commands';

vi.mock('vscode');
vi.mock('../../common/commands');
vi.mock('../utils/mcpUtils', async () => {
  const actual = await vi.importActual('../utils/mcpUtils');
  return {
    ...actual,
    getFirstConnectionOrCreate: vi.fn(),
  };
});

const MOCK_URL = 'http://localhost:10000';
const MOCK_PARSED_URL = new URL(MOCK_URL);

const MOCK_VARIABLES = [
  { id: 'var1', title: 'Table 1', type: 'Table' },
  { id: 'var2', title: 'Plot 1', type: 'Plot' },
];

describe('openVariablePanels', () => {
  const serverManager = {} as unknown as IServerManager;

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
    vi.mocked(getFirstConnectionOrCreate).mockResolvedValue({
      success: true,
      connection: {} as any,
      panelUrlFormat: undefined,
    });

    const tool = createOpenVariablePanelsTool({ serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_URL,
      variables: MOCK_VARIABLES,
    });

    expect(getFirstConnectionOrCreate).toHaveBeenCalledWith({
      serverManager,
      connectionUrl: MOCK_PARSED_URL,
    });
    expect(execOpenVariablePanels).toHaveBeenCalledWith(
      MOCK_PARSED_URL,
      MOCK_VARIABLES
    );
    expect(result.structuredContent).toEqual(
      mcpSuccessResult('Variable panels opened successfully')
    );
  });

  it('should auto-connect to DHC server when no connection exists', async () => {
    vi.mocked(getFirstConnectionOrCreate).mockResolvedValue({
      success: true,
      connection: {} as any,
      panelUrlFormat: undefined,
    });

    const tool = createOpenVariablePanelsTool({ serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_URL,
      variables: MOCK_VARIABLES,
    });

    expect(getFirstConnectionOrCreate).toHaveBeenCalledWith({
      serverManager,
      connectionUrl: MOCK_PARSED_URL,
    });
    expect(execOpenVariablePanels).toHaveBeenCalledWith(
      MOCK_PARSED_URL,
      MOCK_VARIABLES
    );
    expect(result.structuredContent).toEqual(
      mcpSuccessResult('Variable panels opened successfully')
    );
  });

  it('should return error when no variables provided', async () => {
    const tool = createOpenVariablePanelsTool({ serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_URL,
      variables: [],
    });

    expect(result.structuredContent).toEqual(
      mcpErrorResult('No variables provided', { connectionUrl: MOCK_URL })
    );
    expect(getFirstConnectionOrCreate).not.toHaveBeenCalled();
  });

  it.each([
    {
      scenario: 'connection establishment fails',
      errorMessage: 'No connections or server found',
      hint: 'test hint',
      expected: mcpErrorResult(
        'No connections or server found',
        { connectionUrl: MOCK_URL },
        'test hint'
      ),
    },
    {
      scenario: 'server not running',
      errorMessage: 'Server is not running',
      hint: undefined,
      expected: mcpErrorResult('Server is not running', {
        connectionUrl: MOCK_URL,
      }),
    },
  ])(
    'should return error when $scenario',
    async ({ errorMessage, hint, expected }) => {
      vi.mocked(getFirstConnectionOrCreate).mockResolvedValue({
        success: false,
        errorMessage,
        hint,
        details: { connectionUrl: MOCK_URL },
      });

      const tool = createOpenVariablePanelsTool({ serverManager });
      const result = await tool.handler({
        connectionUrl: MOCK_URL,
        variables: MOCK_VARIABLES,
      });

      expect(result.structuredContent).toEqual(expected);
    }
  );

  it('should handle invalid URL', async () => {
    const tool = createOpenVariablePanelsTool({ serverManager });
    const result = await tool.handler({
      connectionUrl: 'invalid-url',
      variables: MOCK_VARIABLES,
    });

    expect(result.structuredContent).toEqual(
      mcpErrorResult('Invalid URL: Invalid URL', {
        connectionUrl: 'invalid-url',
      })
    );
    expect(getFirstConnectionOrCreate).not.toHaveBeenCalled();
  });

  it('should handle errors from execOpenVariablePanels', async () => {
    vi.mocked(getFirstConnectionOrCreate).mockResolvedValue({
      success: true,
      connection: {} as any,
      panelUrlFormat: undefined,
    });
    vi.mocked(execOpenVariablePanels).mockRejectedValue(
      new Error('Test error')
    );

    const tool = createOpenVariablePanelsTool({ serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_URL,
      variables: MOCK_VARIABLES,
    });

    expect(result.structuredContent).toEqual(
      mcpErrorResult('Failed to open variable panels: Test error')
    );
  });
});
