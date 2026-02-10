import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createListPanelVariablesTool } from './listPanelVariables';
import type {
  IDhcService,
  IPanelService,
  IServerManager,
  VariableDefintion,
} from '../../types';
import { getFirstConnectionOrCreate } from '../utils/serverUtils';
import {
  fakeMcpToolTimings,
  mcpErrorResult,
  mcpSuccessResult,
} from '../utils/mcpTestUtils';

vi.mock('vscode');
vi.mock('../utils/serverUtils', async () => {
  const actual = await vi.importActual('../utils/serverUtils');
  return {
    ...actual,
    getFirstConnectionOrCreate: vi.fn(),
  };
});

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

const MOCK_PANEL_URL_FORMAT = 'mock.panelUrlFormat';

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

    fakeMcpToolTimings();
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
      label: 'with variables',
      variables: MOCK_VARIABLES,
    },
    {
      label: 'with no variables',
      variables: [],
    },
  ])('should list panel variables: $label', async ({ variables }) => {
    vi.mocked(getFirstConnectionOrCreate).mockResolvedValue({
      success: true,
      connection: {} as IDhcService,
      panelUrlFormat: MOCK_PANEL_URL_FORMAT,
    });
    vi.mocked(panelService.getVariables).mockReturnValue(variables);

    const tool = createListPanelVariablesTool({
      panelService,
      serverManager,
    });
    const result = await tool.handler({ connectionUrl: MOCK_URL });

    expect(getFirstConnectionOrCreate).toHaveBeenCalledWith({
      connectionUrl: MOCK_PARSED_URL,
      serverManager,
    });
    expect(panelService.getVariables).toHaveBeenCalledWith(MOCK_PARSED_URL);
    expect(result.structuredContent).toEqual(
      mcpSuccessResult(`Found ${variables.length} panel variable(s)`, {
        panelUrlFormat: MOCK_PANEL_URL_FORMAT,
        variables: variables.map(({ id, title, type }) => ({
          id,
          title,
          type,
        })),
      })
    );
  });

  it.each([
    {
      label: 'without hint',
      errorMessage: 'Failed to connect to server',
    },
    {
      label: 'with hint',
      errorMessage: 'No active connection',
      hint: 'Use connectToServer first',
    },
  ])(
    'should return error when getFirstConnectionOrCreate fails $label',
    async ({ errorMessage, hint }) => {
      vi.mocked(getFirstConnectionOrCreate).mockResolvedValue({
        success: false,
        errorMessage,
        hint,
        details: { connectionUrl: MOCK_URL },
      });

      const tool = createListPanelVariablesTool({
        panelService,
        serverManager,
      });
      const result = await tool.handler({ connectionUrl: MOCK_URL });

      expect(getFirstConnectionOrCreate).toHaveBeenCalledWith({
        connectionUrl: MOCK_PARSED_URL,
        serverManager,
      });
      expect(result.structuredContent).toEqual(
        mcpErrorResult(errorMessage, { connectionUrl: MOCK_URL }, hint)
      );
      expect(panelService.getVariables).not.toHaveBeenCalled();
    }
  );

  it('should handle invalid URL', async () => {
    const tool = createListPanelVariablesTool({ panelService, serverManager });
    const result = await tool.handler({ connectionUrl: 'invalid-url' });

    expect(result.structuredContent).toEqual(
      mcpErrorResult('Invalid URL: Invalid URL', {
        connectionUrl: 'invalid-url',
      })
    );
    expect(panelService.getVariables).not.toHaveBeenCalled();
  });

  it('should handle errors from panelService', async () => {
    vi.mocked(getFirstConnectionOrCreate).mockResolvedValue({
      success: true,
      connection: {} as IDhcService,
      panelUrlFormat: MOCK_PANEL_URL_FORMAT,
    });
    vi.mocked(panelService.getVariables).mockImplementation(() => {
      throw new Error('Test error');
    });

    const tool = createListPanelVariablesTool({ panelService, serverManager });
    const result = await tool.handler({ connectionUrl: MOCK_URL });

    expect(result.structuredContent).toEqual(
      mcpErrorResult('Failed to list panel variables: Test error')
    );
  });
});
