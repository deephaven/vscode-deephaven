import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectionToResult,
  getFirstConnectionOrCreate,
  getServerMatchPortIfLocalHost,
  serverToResult,
} from './serverUtils';
import type {
  ConnectionState,
  IDhcService,
  IServerManager,
  Psk,
  ServerState,
  UniqueID,
} from '../../types';
import { execConnectToServer } from '../../common/commands';
import { boolValues, matrixObject } from '../../testUtils';
import { getDhcPanelUrlFormat, getDhePanelUrlFormat } from './panelUtils';
import { createConnectionNotFoundHint } from './runCodeUtils';
import { createMockDhcService } from './mcpTestUtils';

vi.mock('vscode');
vi.mock('../../common/commands');
vi.mock('./panelUtils');
vi.mock('./runCodeUtils');

describe('serverUtils', () => {
  const serverUrl = new URL('http://localhost:10000');

  describe('connectionToResult', () => {
    it.each(
      matrixObject({
        isConnected: boolValues,
        isRunningCode: boolValues,
        tagId: ['mock-tag' as UniqueID, undefined],
      })
    )(
      'should map isConnected=$isConnected, isRunningCode=$isRunningCode, tagId=$tagId',
      ({ isConnected, isRunningCode, tagId }) => {
        const resultWithoutTag = connectionToResult({
          isConnected,
          isRunningCode,
          serverUrl,
          tagId,
        });

        expect(resultWithoutTag, 'without tag').toEqual({
          isConnected,
          isRunningCode,
          serverUrl: serverUrl.toString(),
          tagId,
        });
      }
    );
  });

  describe('getFirstConnectionOrCreate', () => {
    const mockUrl = new URL('http://localhost:10000');
    const mockUrl2 = new URL('http://localhost:10001');
    const mockConnection: IDhcService = createMockDhcService({
      serverUrl: mockUrl,
    });
    const mockConnection2: IDhcService = createMockDhcService({
      serverUrl: mockUrl2,
    });

    const runningDhcServer = {
      url: mockUrl,
      type: 'DHC',
      isRunning: true,
    } as ServerState;

    const notRunningDhcServer = {
      url: mockUrl,
      type: 'DHC',
      isRunning: false,
    } as ServerState;

    const runningDheServer = {
      url: mockUrl,
      type: 'DHE',
      isRunning: true,
    } as ServerState;

    // Create a connection that is not a DhcService instance
    const nonDhcServiceConnection = {
      serverUrl: mockUrl,
      isConnected: true,
    } as ConnectionState;

    const serverManager: IServerManager = {
      getServer: vi.fn(),
      getConnections: vi.fn(),
      getDheServiceForWorker: vi.fn(),
      getWorkerInfo: vi.fn(),
    } as unknown as IServerManager;

    const mockPromptUserToSelectConnection = vi.fn();

    beforeEach(() => {
      vi.clearAllMocks();
    });

    describe('error cases', () => {
      it.each([
        {
          scenario: 'no server found with languageId',
          languageId: 'python',
          expectHint: true,
        },
        {
          scenario: 'no server found without languageId',
          languageId: undefined,
          expectHint: false,
        },
      ])(
        'should return error when $scenario',
        async ({ languageId, expectHint }) => {
          vi.mocked(serverManager.getServer).mockReturnValue(undefined);

          vi.mocked(createConnectionNotFoundHint).mockResolvedValue(
            'mock.hint'
          );

          const result = await getFirstConnectionOrCreate({
            serverManager,
            connectionUrl: mockUrl,
            languageId,
          });

          expect(result).toEqual({
            success: false,
            errorMessage: 'No connections or server found',
            details: { connectionUrl: mockUrl.href },
            hint: expectHint ? 'mock.hint' : undefined,
          });

          if (languageId) {
            expect(createConnectionNotFoundHint).toHaveBeenCalledWith(
              serverManager,
              mockUrl.href,
              languageId
            );
          }
        }
      );

      it('should return error when server is not running', async () => {
        vi.mocked(serverManager.getServer).mockReturnValue(notRunningDhcServer);

        const result = await getFirstConnectionOrCreate({
          serverManager,
          connectionUrl: mockUrl,
        });

        expect(result).toEqual({
          success: false,
          errorMessage: 'Server is not running',
          details: { connectionUrl: mockUrl.href },
        });
      });

      it('should return error when DHE server has no active connection', async () => {
        vi.mocked(serverManager.getServer).mockReturnValue(runningDheServer);
        vi.mocked(serverManager.getConnections).mockReturnValue([]);

        const result = await getFirstConnectionOrCreate({
          serverManager,
          connectionUrl: mockUrl,
        });

        expect(result).toEqual({
          success: false,
          errorMessage: 'No active connection',
          hint: 'Use connectToServer first',
          details: { connectionUrl: mockUrl.href },
        });
      });

      it('should return error when DHC auto-connect fails', async () => {
        vi.mocked(serverManager.getServer).mockReturnValue(runningDhcServer);
        vi.mocked(serverManager.getConnections).mockReturnValue([]);
        vi.mocked(execConnectToServer).mockResolvedValue(undefined);

        const result = await getFirstConnectionOrCreate({
          serverManager,
          connectionUrl: mockUrl,
        });

        expect(result).toEqual({
          success: false,
          errorMessage: 'Failed to connect to server',
          details: { connectionUrl: mockUrl.href },
        });
        expect(execConnectToServer).toHaveBeenCalledWith({
          type: 'DHC',
          url: mockUrl,
        });
      });

      it('should return error when connection is not a DhcService', async () => {
        vi.mocked(serverManager.getServer).mockReturnValue(runningDhcServer);
        vi.mocked(serverManager.getConnections).mockReturnValue([
          nonDhcServiceConnection,
        ]);

        const result = await getFirstConnectionOrCreate({
          serverManager,
          connectionUrl: mockUrl,
        });

        expect(result).toEqual({
          success: false,
          errorMessage: 'Connection is not a Core / Core+ connection.',
          details: { connectionUrl: mockUrl.href },
        });
      });
    });

    describe('null connectionUrl handling', () => {
      it('should use single connection when connectionUrl is null and exactly 1 connection exists', async () => {
        const mockPanelUrlFormat = 'mock.panelUrlFormat';

        vi.mocked(serverManager.getConnections)
          .mockReturnValueOnce([mockConnection]) // First call to check connection count
          .mockReturnValueOnce([mockConnection]); // Second call after getting server
        vi.mocked(serverManager.getServer).mockReturnValue(runningDhcServer);
        vi.mocked(getDhcPanelUrlFormat).mockReturnValue(mockPanelUrlFormat);

        const result = await getFirstConnectionOrCreate({
          serverManager,
          connectionUrl: null,
        });

        expect(result).toEqual({
          success: true,
          connection: mockConnection,
          panelUrlFormat: mockPanelUrlFormat,
        });
        expect(mockPromptUserToSelectConnection).not.toHaveBeenCalled();
      });

      it('should prompt user when connectionUrl is null and multiple connections exist', async () => {
        const mockPanelUrlFormat = 'mock.panelUrlFormat';

        vi.mocked(serverManager.getConnections)
          .mockReturnValueOnce([mockConnection, mockConnection2]) // Multiple connections
          .mockReturnValueOnce([mockConnection2]); // After prompt selects mockUrl2
        vi.mocked(serverManager.getServer).mockReturnValue(runningDhcServer);
        vi.mocked(getDhcPanelUrlFormat).mockReturnValue(mockPanelUrlFormat);
        mockPromptUserToSelectConnection.mockResolvedValue(mockUrl2);

        const result = await getFirstConnectionOrCreate({
          serverManager,
          connectionUrl: null,
          promptUserToSelectConnection: mockPromptUserToSelectConnection,
        });

        expect(result).toEqual({
          success: true,
          connection: mockConnection2,
          panelUrlFormat: mockPanelUrlFormat,
        });
        expect(mockPromptUserToSelectConnection).toHaveBeenCalledOnce();
      });

      it('should return error when connectionUrl is null, multiple connections, and no prompt provided', async () => {
        vi.mocked(serverManager.getConnections).mockReturnValue([
          mockConnection,
          mockConnection2,
        ]);

        const result = await getFirstConnectionOrCreate({
          serverManager,
          connectionUrl: null,
        });

        expect(result).toEqual({
          success: false,
          errorMessage: 'No connection selected',
          details: { connectionUrl: 'null' },
        });
      });

      it('should return error when connectionUrl is null and prompt returns null', async () => {
        vi.mocked(serverManager.getConnections).mockReturnValue([
          mockConnection,
          mockConnection2,
        ]);
        mockPromptUserToSelectConnection.mockResolvedValue(null);

        const result = await getFirstConnectionOrCreate({
          serverManager,
          connectionUrl: null,
          promptUserToSelectConnection: mockPromptUserToSelectConnection,
        });

        expect(result).toEqual({
          success: false,
          errorMessage: 'No connection selected',
          details: { connectionUrl: 'null' },
        });
        expect(mockPromptUserToSelectConnection).toHaveBeenCalledOnce();
      });

      it('should prompt user when connectionUrl is null and no connections exist', async () => {
        const mockPanelUrlFormat = 'mock.panelUrlFormat';

        vi.mocked(serverManager.getConnections)
          .mockReturnValueOnce([]) // No connections initially
          .mockReturnValueOnce([]) // Still no connections after prompt, will auto-connect
          .mockReturnValueOnce([mockConnection]); // After auto-connect
        vi.mocked(serverManager.getServer).mockReturnValue(runningDhcServer);
        vi.mocked(execConnectToServer).mockResolvedValue(undefined);
        vi.mocked(getDhcPanelUrlFormat).mockReturnValue(mockPanelUrlFormat);
        mockPromptUserToSelectConnection.mockResolvedValue(mockUrl);

        const result = await getFirstConnectionOrCreate({
          serverManager,
          connectionUrl: null,
          promptUserToSelectConnection: mockPromptUserToSelectConnection,
        });

        expect(result).toEqual({
          success: true,
          connection: mockConnection,
          panelUrlFormat: mockPanelUrlFormat,
        });
        expect(mockPromptUserToSelectConnection).toHaveBeenCalledOnce();
        expect(execConnectToServer).toHaveBeenCalledWith({
          type: 'DHC',
          url: mockUrl,
        });
      });
    });

    describe('success cases', () => {
      it('should return connection for DHC server with existing connection', async () => {
        const mockPanelUrlFormat = 'mock.panelUrlFormat';

        vi.mocked(serverManager.getServer).mockReturnValue(runningDhcServer);
        vi.mocked(serverManager.getConnections).mockReturnValue([
          mockConnection,
        ]);
        vi.mocked(getDhcPanelUrlFormat).mockReturnValue(mockPanelUrlFormat);

        const result = await getFirstConnectionOrCreate({
          serverManager,
          connectionUrl: mockUrl,
        });

        expect(result).toEqual({
          success: true,
          connection: mockConnection,
          panelUrlFormat: mockPanelUrlFormat,
        });
      });

      it('should auto-connect and return connection for DHC server with no connection', async () => {
        const mockPanelUrlFormat = 'mock.panelUrlFormat';

        vi.mocked(serverManager.getServer).mockReturnValue(runningDhcServer);
        vi.mocked(serverManager.getConnections)
          .mockReturnValueOnce([]) // First call returns no connections
          .mockReturnValueOnce([mockConnection]); // After auto-connect
        vi.mocked(execConnectToServer).mockResolvedValue(undefined);
        vi.mocked(getDhcPanelUrlFormat).mockReturnValue(mockPanelUrlFormat);

        const result = await getFirstConnectionOrCreate({
          serverManager,
          connectionUrl: mockUrl,
        });

        expect(result).toEqual({
          success: true,
          connection: mockConnection,
          panelUrlFormat: mockPanelUrlFormat,
        });
        expect(execConnectToServer).toHaveBeenCalledWith({
          type: 'DHC',
          url: mockUrl,
        });
      });

      it('should return connection for DHE server', async () => {
        const mockPanelUrlFormat = 'mock.panelUrlFormat';

        vi.mocked(serverManager.getServer).mockReturnValue(runningDheServer);
        vi.mocked(serverManager.getConnections).mockReturnValue([
          mockConnection,
        ]);
        vi.mocked(getDhePanelUrlFormat).mockResolvedValue(mockPanelUrlFormat);

        const result = await getFirstConnectionOrCreate({
          serverManager,
          connectionUrl: mockUrl,
        });

        expect(result).toEqual({
          success: true,
          connection: mockConnection,
          panelUrlFormat: mockPanelUrlFormat,
        });

        expect(getDhePanelUrlFormat).toHaveBeenCalledWith(
          mockUrl,
          mockUrl,
          serverManager
        );
      });
    });
  });

  describe('getServerMatchPortIfLocalHost', () => {
    const mockServer: ServerState = {
      isRunning: true,
      type: 'DHC',
      url: new URL('http://localhost:10000'),
      isConnected: false,
      connectionCount: 0,
    };

    const serverManager = { getServer: vi.fn() } as unknown as IServerManager;

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it.each([
      {
        hostname: 'localhost',
        url: 'http://localhost:10000',
        expectedMatchPort: true,
      },
      {
        hostname: '127.0.0.1',
        url: 'http://127.0.0.1:10000',
        expectedMatchPort: true,
      },
      {
        hostname: 'example.com',
        url: 'http://example.com:10000',
        expectedMatchPort: false,
      },
    ])(
      'should call getServer with matchPort=$expectedMatchPort for $hostname',
      ({ url, expectedMatchPort }) => {
        vi.mocked(serverManager.getServer).mockReturnValue(mockServer);
        const connectionUrl = new URL(url);

        const result = getServerMatchPortIfLocalHost(
          serverManager,
          connectionUrl
        );

        expect(result).toBe(mockServer);
        expect(serverManager.getServer).toHaveBeenCalledWith(
          connectionUrl,
          expectedMatchPort
        );
      }
    );
  });

  describe('serverToResult', () => {
    const label = 'mock label';
    const psk = 'test-psk' as Psk;
    const tagId = 'mock-tag' as UniqueID;

    const MOCK_CONNECTION: ConnectionState = {
      isConnected: true,
      isRunningCode: true,
      serverUrl,
      tagId,
    } as ConnectionState;

    it.each(
      matrixObject({
        isConnected: boolValues,
        isRunning: boolValues,
        isManaged: boolValues,
        type: ['DHC', 'DHE'],
        connectionCount: [1, 2],
        connections: [[MOCK_CONNECTION], []],
      })
    )(
      'should map isConnected=$isConnected, isRunning=$isRunning, isManaged=$isManaged, type=$type, connectionCount=$connectionCount, connections=$connections',
      ({
        isConnected,
        isRunning,
        isManaged,
        type,
        connectionCount,
        connections,
      }) => {
        const server: ServerState = {
          type,
          connectionCount,
          isConnected,
          isRunning,
          isManaged,
          label,
          psk,
          url: serverUrl,
        } as ServerState;

        const result = serverToResult(server, connections);

        expect(result).toEqual({
          type,
          url: serverUrl.toString(),
          connectionCount,
          label,
          isConnected,
          isManaged,
          isRunning,
          tags: isManaged ? ['pip', 'managed'] : [],
          connections: connections.map(connectionToResult),
        });
      }
    );
  });
});
