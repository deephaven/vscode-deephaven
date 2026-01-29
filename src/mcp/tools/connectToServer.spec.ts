import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createConnectToServerTool } from './connectToServer';
import type { IServerManager, ServerState } from '../../types';
import { McpToolResponse } from '../utils/mcpUtils';
import * as uriUtils from '../../util/uriUtils';
import * as commands from '../../common/commands';

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

const MOCK_EXECUTION_TIME_MS = 100;
const MOCK_URL = 'http://localhost:10000';
const MOCK_PARSED_URL = new URL(MOCK_URL);
const MOCK_SERVER = {
  type: 'DHC',
  url: MOCK_PARSED_URL,
} as ServerState;

const EXPECTED_INVALID_URL_ERROR = {
  success: false,
  message: 'Invalid server URL: Invalid URL format',
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
  hint: "Please provide a valid URL (e.g., 'http://localhost:10000'). If this was a server label, use listServers to find the corresponding URL.",
  details: {
    url: 'invalid-url',
  },
};

const EXPECTED_SERVER_NOT_FOUND_ERROR = {
  success: false,
  message: 'Server not found',
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
  hint: 'Use listServers to see available servers.',
  details: {
    url: MOCK_URL,
  },
};

const EXPECTED_CONNECTION_ERROR = {
  success: false,
  message: 'Failed to connect to server: Connection command error',
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
};

const EXPECTED_SUCCESS = {
  success: true,
  message: 'Connecting to server',
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
  details: {
    type: 'DHC',
    url: MOCK_URL,
  },
};

describe('createConnectToServerTool', () => {
  const serverManager: IServerManager = {
    getServer: vi.fn(),
  } as unknown as IServerManager;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(McpToolResponse.prototype, 'getElapsedTimeMs').mockReturnValue(
      MOCK_EXECUTION_TIME_MS
    );
  });

  it('should create tool with correct name and spec', () => {
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

      expect(result.structuredContent).toEqual(EXPECTED_SUCCESS);
    });

    it.each([
      {
        testName: 'invalid URL',
        url: 'invalid-url',
        parseResult: { success: false as const, error: 'Invalid URL format' },
        serverResult: undefined,
        commandError: undefined,
        expected: EXPECTED_INVALID_URL_ERROR,
      },
      {
        testName: 'server not found',
        url: MOCK_URL,
        parseResult: { success: true as const, value: MOCK_PARSED_URL },
        serverResult: undefined,
        commandError: undefined,
        expected: EXPECTED_SERVER_NOT_FOUND_ERROR,
      },
      {
        testName: 'connection command error',
        url: MOCK_URL,
        parseResult: { success: true as const, value: MOCK_PARSED_URL },
        serverResult: MOCK_SERVER,
        commandError: new Error('Connection command error'),
        expected: EXPECTED_CONNECTION_ERROR,
      },
    ])(
      'should handle $testName',
      async ({ url, parseResult, serverResult, commandError, expected }) => {
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

        expect(result.structuredContent).toEqual(expected);
      }
    );
  });
});
