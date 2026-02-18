import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createConnectToServerTool } from './connectToServer';
import type { IServerManager, ServerState } from '../../types';
import * as uriUtils from '../../util/uriUtils';
import * as commands from '../../common/commands';
import {
  fakeMcpToolTimings,
  mcpErrorResult,
  mcpSuccessResult,
} from '../utils/mcpTestUtils';

vi.mock('vscode');
vi.mock('../../util/uriUtils', async () => {
  return {
    parseUrl: vi.fn(),
  };
});
vi.mock('../../common/commands', async () => {
  return {
    execConnectToServer: vi.fn(),
  };
});

const MOCK_URL = 'http://localhost:10000';
const MOCK_PARSED_URL = new URL(MOCK_URL);
const MOCK_SERVER = {
  type: 'DHC',
  url: MOCK_PARSED_URL,
} as ServerState;

describe('createConnectToServerTool', () => {
  const serverManager: IServerManager = {
    getServer: vi.fn(),
  } as unknown as IServerManager;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeMcpToolTimings();
  });

  it('should return correct tool spec', () => {
    const tool = createConnectToServerTool({ serverManager });

    expect(tool.name).toBe('connectToServer');
    expect(tool.spec.title).toBe('Connect to Server');
    expect(tool.spec.description).toBe(
      'Create a connection to a Deephaven server. The server must already be configured in the extension. For DHE (Enterprise) servers, this will create a new worker.'
    );
  });

  describe('handler', () => {
    it('should connect to server successfully', async () => {
      vi.mocked(uriUtils.parseUrl).mockReturnValue({
        success: true,
        value: MOCK_PARSED_URL,
      });
      vi.mocked(serverManager.getServer).mockReturnValue(MOCK_SERVER);
      vi.mocked(commands.execConnectToServer).mockResolvedValue(undefined);

      const tool = createConnectToServerTool({ serverManager });
      const result = await tool.handler({ url: MOCK_URL });

      expect(uriUtils.parseUrl).toHaveBeenCalledWith(MOCK_URL);
      expect(serverManager.getServer).toHaveBeenCalledWith(MOCK_PARSED_URL);
      expect(commands.execConnectToServer).toHaveBeenCalledWith({
        type: MOCK_SERVER.type,
        url: MOCK_PARSED_URL,
      });

      expect(result.structuredContent).toEqual(
        mcpSuccessResult('Connected to server', {
          type: 'DHC',
          url: MOCK_URL,
        })
      );
    });

    it.each([
      {
        testName: 'invalid URL',
        url: 'invalid-url',
        parseResult: { success: false as const, error: 'Invalid URL format' },
        serverResult: undefined,
        commandError: undefined,
      },
      {
        testName: 'server not found',
        url: MOCK_URL,
        parseResult: { success: true as const, value: MOCK_PARSED_URL },
        serverResult: undefined,
        commandError: undefined,
      },
      {
        testName: 'connection command error',
        url: MOCK_URL,
        parseResult: { success: true as const, value: MOCK_PARSED_URL },
        serverResult: MOCK_SERVER,
        commandError: new Error('Connection command error'),
      },
    ])(
      'should handle $testName',
      async ({ url, parseResult, serverResult, commandError }) => {
        vi.mocked(uriUtils.parseUrl).mockReturnValue(parseResult);
        vi.mocked(serverManager.getServer).mockReturnValue(serverResult);

        if (commandError !== undefined) {
          vi.mocked(commands.execConnectToServer).mockRejectedValue(
            commandError
          );
        } else {
          vi.mocked(commands.execConnectToServer).mockResolvedValue(undefined);
        }

        const tool = createConnectToServerTool({ serverManager });
        const result = await tool.handler({ url });

        expect(uriUtils.parseUrl).toHaveBeenCalledWith(url);

        if (parseResult.success) {
          expect(serverManager.getServer).toHaveBeenCalledWith(
            parseResult.value
          );

          if (serverResult !== undefined) {
            expect(commands.execConnectToServer).toHaveBeenCalledWith({
              type: serverResult.type,
              url: parseResult.value,
            });
          } else {
            expect(commands.execConnectToServer).not.toHaveBeenCalled();
          }
        } else {
          expect(serverManager.getServer).not.toHaveBeenCalled();
          expect(commands.execConnectToServer).not.toHaveBeenCalled();
        }

        // Verify structured content based on test case
        if (parseResult.success === false) {
          expect(result.structuredContent).toEqual(
            mcpErrorResult(
              'Invalid server URL: Invalid URL format',
              { url: 'invalid-url' },
              "Please provide a valid URL (e.g., 'http://localhost:10000'). If this was a server label, use listServers to find the corresponding URL."
            )
          );
        } else if (serverResult === undefined) {
          expect(result.structuredContent).toEqual(
            mcpErrorResult(
              'Server not found',
              { url: MOCK_URL },
              'Use listServers to see available servers.'
            )
          );
        } else if (commandError !== undefined) {
          expect(result.structuredContent).toEqual(
            mcpErrorResult(
              'Failed to connect to server: Connection command error'
            )
          );
        }
      }
    );
  });
});
