import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ConnectionState,
  IDheService,
  IServerManager,
  ServerState,
  WorkerInfo,
} from '../../types';
import {
  formatErrorMessage,
  getDhcPanelUrlFormat,
  getDhePanelUrlFormat,
  getFirstConnectionOrCreate,
  getServerMatchPortIfLocalHost,
  McpToolResponse,
} from './mcpUtils';

vi.mock('vscode');
vi.mock('../../common/commands');
vi.mock('./runCodeUtils');

const MOCK_EXECUTION_TIME_MS = 100;

describe('formatErrorMessage', () => {
  it.each([
    {
      name: 'without error arg',
      errorMessage: 'Operation failed',
      error: undefined,
      expected: 'Operation failed',
    },
    {
      name: 'with Error object',
      errorMessage: 'Operation failed',
      error: new Error('Connection timeout'),
      expected: 'Operation failed: Connection timeout',
    },
    {
      name: 'with string error',
      errorMessage: 'Operation failed',
      error: 'Invalid input',
      expected: 'Operation failed: Invalid input',
    },
    {
      name: 'with number error',
      errorMessage: 'Operation failed',
      error: 404,
      expected: 'Operation failed: 404',
    },
    {
      name: 'with null error',
      errorMessage: 'Operation failed',
      error: null,
      expected: 'Operation failed',
    },
  ])(
    'should format error message $name',
    ({ errorMessage, error, expected }) => {
      expect(formatErrorMessage(errorMessage, error)).toBe(expected);
    }
  );
});

describe('McpToolResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock getElapsedTimeMs to return a fixed value
    vi.spyOn(McpToolResponse.prototype, 'getElapsedTimeMs').mockReturnValue(
      MOCK_EXECUTION_TIME_MS
    );
  });

  describe('getElapsedTimeMs', () => {
    it('should calculate elapsed time from construction', () => {
      // Restore the actual implementation for this test
      vi.spyOn(McpToolResponse.prototype, 'getElapsedTimeMs').mockRestore();

      const startTime = performance.now();
      const response = new McpToolResponse();

      // Wait a bit
      const delay = 10;
      const endTime = startTime + delay;
      vi.spyOn(performance, 'now').mockReturnValue(endTime);

      expect(response.getElapsedTimeMs()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('success', () => {
    it.each([
      {
        name: 'without details',
        message: 'Operation completed',
        details: undefined,
        expected: {
          success: true,
          message: 'Operation completed',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
        },
      },
      {
        name: 'with details object',
        message: 'Data retrieved',
        details: { count: 42, items: ['a', 'b'] },
        expected: {
          success: true,
          message: 'Data retrieved',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
          details: { count: 42, items: ['a', 'b'] },
        },
      },
    ])(
      'should create success result $name',
      ({ message, details, expected }) => {
        const response = new McpToolResponse();
        const result = response.success(message, details);

        expect(result).toEqual({
          content: [
            {
              type: 'text',
              text: JSON.stringify(expected),
            },
          ],
          structuredContent: expected,
        });
      }
    );
  });

  describe('error', () => {
    it.each([
      {
        name: 'error message only',
        errorMessage: 'Mock error message',
        expected: {
          success: false,
          message: 'Mock error message',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
        },
      },
      {
        name: 'Error object',
        errorMessage: 'Mock error message',
        error: new Error('Mock error object'),
        expected: {
          success: false,
          message: 'Mock error message: Mock error object',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
        },
      },
      {
        name: 'details only',
        errorMessage: 'Mock error message',
        details: { field: 'email', reason: 'invalid format' },
        expected: {
          success: false,
          message: 'Mock error message',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
          details: { field: 'email', reason: 'invalid format' },
        },
      },
      {
        name: 'Error object and details',
        errorMessage: 'Mock error message',
        error: new Error('Mock error object'),
        details: { constraint: 'unique_email', table: 'users' },
        expected: {
          success: false,
          message: 'Mock error message: Mock error object',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
          details: { constraint: 'unique_email', table: 'users' },
        },
      },
    ])(
      'should create error result $name',
      ({ errorMessage, error, details, expected }) => {
        const response = new McpToolResponse();
        const result = response.error(errorMessage, error, details);

        expect(result).toEqual({
          content: [
            {
              type: 'text',
              text: JSON.stringify(expected),
            },
          ],
          structuredContent: expected,
        });
      }
    );
  });

  describe('errorWithHint', () => {
    it.each([
      {
        name: 'hint',
        errorMessage: 'Mock error message',
        hint: 'Mock hint',
        expected: {
          success: false,
          message: 'Mock error message',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
          hint: 'Mock hint',
        },
      },
      {
        name: 'error, hint, and details',
        errorMessage: 'Mock error message',
        error: new Error('Mock error object'),
        hint: 'Mock hint',
        details: { module: 'pandas' },
        expected: {
          success: false,
          message: 'Mock error message: Mock error object',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
          hint: 'Mock hint',
          details: { module: 'pandas' },
        },
      },
      {
        name: 'error and hint',
        errorMessage: 'Mock error message',
        error: new Error('Mock error object'),
        hint: 'Mock hint',
        expected: {
          success: false,
          message: 'Mock error message: Mock error object',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
          hint: 'Mock hint',
        },
      },
      {
        name: 'error only',
        errorMessage: 'Mock error message',
        error: new Error('Mock error object'),
        expected: {
          success: false,
          message: 'Mock error message: Mock error object',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
        },
      },
      {
        name: 'error and details',
        errorMessage: 'Mock error message',
        error: new Error('Mock error object'),
        details: { line: 42, column: 10 },
        expected: {
          success: false,
          message: 'Mock error message: Mock error object',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
          details: { line: 42, column: 10 },
        },
      },
      {
        name: 'hint and details',
        errorMessage: 'Mock error message',
        hint: 'Mock hint',
        details: { field: 'port', value: 'abc' },
        expected: {
          success: false,
          message: 'Mock error message',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
          hint: 'Mock hint',
          details: { field: 'port', value: 'abc' },
        },
      },
      {
        name: 'details only',
        errorMessage: 'Mock error message',
        details: { errors: ['missing field', 'invalid type'] },
        expected: {
          success: false,
          message: 'Mock error message',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
          details: { errors: ['missing field', 'invalid type'] },
        },
      },
      {
        name: 'error message only',
        errorMessage: 'Mock error message',
        expected: {
          success: false,
          message: 'Mock error message',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
        },
      },
    ])(
      'should create error result $name',
      ({ errorMessage, error, hint, details, expected }) => {
        const response = new McpToolResponse();
        const result = response.errorWithHint(
          errorMessage,
          error,
          hint,
          details
        );

        expect(result).toEqual({
          content: [
            {
              type: 'text',
              text: JSON.stringify(expected),
            },
          ],
          structuredContent: expected,
        });
      }
    );
  });
});

describe('getFirstConnectionOrCreate', () => {
  const mockUrl = new URL('http://localhost:10000');
  const mockConnection: ConnectionState = {
    serverUrl: mockUrl,
    isConnected: true,
  };

  let serverManager: IServerManager;
  let execConnectToServerMock: ReturnType<typeof vi.fn>;
  let createConnectionNotFoundHintMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { execConnectToServer } = await import('../../common/commands');
    const { createConnectionNotFoundHint } = await import('./runCodeUtils');

    execConnectToServerMock = vi.mocked(execConnectToServer);
    createConnectionNotFoundHintMock = vi.mocked(createConnectionNotFoundHint);

    serverManager = {
      getServer: vi.fn(),
      getConnections: vi.fn(),
      getDheServiceForWorker: vi.fn(),
      getWorkerInfo: vi.fn(),
    } as unknown as IServerManager;
  });

  describe('error cases', () => {
    it.each([
      {
        scenario: 'no server found with languageId',
        serverExists: false,
        languageId: 'python',
        expectedHint: 'Try connecting to a server first',
        expected: {
          success: false,
          errorMessage: 'No connections or server found',
          hint: 'Try connecting to a server first',
          details: { connectionUrl: mockUrl.href },
        },
      },
      {
        scenario: 'no server found without languageId',
        serverExists: false,
        languageId: undefined,
        expectedHint: undefined,
        expected: {
          success: false,
          errorMessage: 'No connections or server found',
          details: { connectionUrl: mockUrl.href },
        },
      },
    ])(
      'should return error when $scenario',
      async ({ serverExists, languageId, expectedHint, expected }) => {
        vi.mocked(serverManager.getServer).mockReturnValue(
          serverExists ? ({} as ServerState) : undefined
        );
        if (expectedHint) {
          createConnectionNotFoundHintMock.mockResolvedValue(expectedHint);
        }

        const result = await getFirstConnectionOrCreate({
          serverManager,
          connectionUrl: mockUrl,
          languageId,
        });

        expect(result).toEqual(expected);
        if (languageId) {
          expect(createConnectionNotFoundHintMock).toHaveBeenCalledWith(
            serverManager,
            mockUrl.href,
            languageId
          );
        }
      }
    );

    it('should return error when server is not running', async () => {
      const mockServer: ServerState = {
        url: mockUrl,
        type: 'DHC',
        isRunning: false,
      } as ServerState;

      vi.mocked(serverManager.getServer).mockReturnValue(mockServer);

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
      const mockServer: ServerState = {
        url: mockUrl,
        type: 'DHE',
        isRunning: true,
      } as ServerState;

      vi.mocked(serverManager.getServer).mockReturnValue(mockServer);
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
      const mockServer: ServerState = {
        url: mockUrl,
        type: 'DHC',
        isRunning: true,
      } as ServerState;

      vi.mocked(serverManager.getServer).mockReturnValue(mockServer);
      vi.mocked(serverManager.getConnections).mockReturnValue([]);
      execConnectToServerMock.mockResolvedValue(undefined);

      const result = await getFirstConnectionOrCreate({
        serverManager,
        connectionUrl: mockUrl,
      });

      expect(result).toEqual({
        success: false,
        errorMessage: 'Failed to connect to server',
        details: { connectionUrl: mockUrl.href },
      });
      expect(execConnectToServerMock).toHaveBeenCalledWith({
        type: 'DHC',
        url: mockUrl,
      });
    });
  });

  describe('success cases', () => {
    it('should return connection for DHC server with existing connection', async () => {
      const mockServer: ServerState = {
        url: mockUrl,
        type: 'DHC',
        isRunning: true,
      } as ServerState;

      vi.mocked(serverManager.getServer).mockReturnValue(mockServer);
      vi.mocked(serverManager.getConnections).mockReturnValue([mockConnection]);

      const result = await getFirstConnectionOrCreate({
        serverManager,
        connectionUrl: mockUrl,
      });

      expect(result).toEqual({
        success: true,
        connection: mockConnection,
        panelUrlFormat: `${mockUrl.origin}/iframe/widget/?name=<variableTitle>`,
      });
    });

    it('should auto-connect and return connection for DHC server with no connection', async () => {
      const mockServer: ServerState = {
        url: mockUrl,
        type: 'DHC',
        isRunning: true,
      } as ServerState;

      vi.mocked(serverManager.getServer).mockReturnValue(mockServer);
      vi.mocked(serverManager.getConnections)
        .mockReturnValueOnce([]) // First call returns no connections
        .mockReturnValueOnce([mockConnection]); // After auto-connect
      execConnectToServerMock.mockResolvedValue(undefined);

      const result = await getFirstConnectionOrCreate({
        serverManager,
        connectionUrl: mockUrl,
      });

      expect(result).toEqual({
        success: true,
        connection: mockConnection,
        panelUrlFormat: `${mockUrl.origin}/iframe/widget/?name=<variableTitle>`,
      });
      expect(execConnectToServerMock).toHaveBeenCalledWith({
        type: 'DHC',
        url: mockUrl,
      });
    });

    it('should return connection for DHE server with embedDashboardsAndWidgets feature', async () => {
      const mockServer: ServerState = {
        url: mockUrl,
        type: 'DHE',
        isRunning: true,
      } as ServerState;

      const mockDheService = {
        getServerFeatures: vi.fn().mockReturnValue({
          features: {
            embedDashboardsAndWidgets: true,
          },
        }),
      };

      const mockWorkerInfo = {
        serial: 'test-serial-123',
      };

      vi.mocked(serverManager.getServer).mockReturnValue(mockServer);
      vi.mocked(serverManager.getConnections).mockReturnValue([mockConnection]);
      vi.mocked(serverManager.getDheServiceForWorker).mockResolvedValue(
        mockDheService as never
      );
      vi.mocked(serverManager.getWorkerInfo).mockResolvedValue(
        mockWorkerInfo as never
      );

      const result = await getFirstConnectionOrCreate({
        serverManager,
        connectionUrl: mockUrl,
      });

      expect(result).toEqual({
        success: true,
        connection: mockConnection,
        panelUrlFormat: `${mockUrl.origin}/iriside/embed/widget/serial/test-serial-123/<variableTitle>`,
      });
    });

    it('should return connection for DHE server without embedDashboardsAndWidgets feature', async () => {
      const mockServer: ServerState = {
        url: mockUrl,
        type: 'DHE',
        isRunning: true,
      } as ServerState;

      const mockDheService = {
        getServerFeatures: vi.fn().mockReturnValue({
          features: {
            embedDashboardsAndWidgets: false,
          },
        }),
      };

      vi.mocked(serverManager.getServer).mockReturnValue(mockServer);
      vi.mocked(serverManager.getConnections).mockReturnValue([mockConnection]);
      vi.mocked(serverManager.getDheServiceForWorker).mockResolvedValue(
        mockDheService as never
      );

      const result = await getFirstConnectionOrCreate({
        serverManager,
        connectionUrl: mockUrl,
      });

      expect(result).toEqual({
        success: true,
        connection: mockConnection,
        panelUrlFormat: undefined,
      });
      expect(serverManager.getWorkerInfo).not.toHaveBeenCalled();
    });

    it('should return connection for DHE server when getServerFeatures returns undefined', async () => {
      const mockServer: ServerState = {
        url: mockUrl,
        type: 'DHE',
        isRunning: true,
      } as ServerState;

      const mockDheService = {
        getServerFeatures: vi.fn().mockReturnValue(undefined),
      };

      vi.mocked(serverManager.getServer).mockReturnValue(mockServer);
      vi.mocked(serverManager.getConnections).mockReturnValue([mockConnection]);
      vi.mocked(serverManager.getDheServiceForWorker).mockResolvedValue(
        mockDheService as never
      );

      const result = await getFirstConnectionOrCreate({
        serverManager,
        connectionUrl: mockUrl,
      });

      expect(result).toEqual({
        success: true,
        connection: mockConnection,
        panelUrlFormat: undefined,
      });
    });
  });
});

describe('getDhcPanelUrlFormat', () => {
  it.each([
    {
      url: 'http://localhost:10000',
      expected: 'http://localhost:10000/iframe/widget/?name=<variableTitle>',
    },
    {
      url: 'https://example.com:8080/some/path',
      expected: 'https://example.com:8080/iframe/widget/?name=<variableTitle>',
    },
  ])('should return correct panel URL format for $url', ({ url, expected }) => {
    const serverUrl = new URL(url);
    const result = getDhcPanelUrlFormat(serverUrl);
    expect(result).toBe(expected);
  });
});

describe('getDhePanelUrlFormat', () => {
  const MOCK_SERVER_URL = new URL('https://example.deephaven.io');
  const MOCK_CONNECTION_URL = new URL('https://example.deephaven.io/worker/1');

  const mockDheService = {
    getServerFeatures: vi.fn(),
  } as unknown as IDheService;

  const serverManager: IServerManager = {
    getConnections: vi.fn(),
    getServer: vi.fn(),
    getDheServiceForWorker: vi.fn(),
    getWorkerInfo: vi.fn(),
  } as unknown as IServerManager;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    {
      scenario: 'DHE service is not available',
      dheService: null,
      features: undefined,
      workerInfo: undefined,
      expected: undefined,
    },
    {
      scenario: 'embedDashboardsAndWidgets feature is not enabled',
      dheService: mockDheService,
      features: { embedDashboardsAndWidgets: false },
      workerInfo: undefined,
      expected: undefined,
    },
    {
      scenario: 'getServerFeatures returns undefined',
      dheService: mockDheService,
      features: undefined,
      workerInfo: undefined,
      expected: undefined,
    },
    {
      scenario: 'worker info is not available',
      dheService: mockDheService,
      features: { embedDashboardsAndWidgets: true },
      workerInfo: undefined,
      expected: undefined,
    },
    {
      scenario: 'all conditions are met',
      dheService: mockDheService,
      features: { embedDashboardsAndWidgets: true },
      workerInfo: { serial: 'abc123' } as WorkerInfo,
      expected:
        'https://example.deephaven.io/iriside/embed/widget/serial/abc123/<variableTitle>',
    },
  ])(
    'should return $expected when $scenario',
    async ({ dheService, features, workerInfo, expected }) => {
      if (dheService !== null) {
        vi.mocked(mockDheService.getServerFeatures).mockReturnValue(
          features
            ? { version: 1, features: { createQueryIframe: true, ...features } }
            : undefined
        );
      }

      vi.mocked(serverManager.getDheServiceForWorker).mockResolvedValue(
        dheService
      );
      vi.mocked(serverManager.getWorkerInfo).mockResolvedValue(workerInfo);

      const result = await getDhePanelUrlFormat(
        MOCK_SERVER_URL,
        MOCK_CONNECTION_URL,
        serverManager
      );

      expect(result).toBe(expected);
    }
  );
});

describe('getServerMatchPortIfLocalHost', () => {
  const mockServer: ServerState = {
    isRunning: true,
    type: 'DHC',
    url: new URL('http://localhost:10000'),
    isConnected: false,
    connectionCount: 0,
  };

  const getServerMock = vi.fn();
  const serverManager = { getServer: getServerMock };

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
    {
      hostname: 'remote.server.io',
      url: 'https://remote.server.io:8080',
      expectedMatchPort: false,
    },
  ])(
    'should call getServer with matchPort=$expectedMatchPort for $hostname',
    ({ url, expectedMatchPort }) => {
      getServerMock.mockReturnValue(mockServer);
      const connectionUrl = new URL(url);

      const result = getServerMatchPortIfLocalHost(
        serverManager,
        connectionUrl
      );

      expect(result).toBe(mockServer);
      expect(getServerMock).toHaveBeenCalledWith(
        connectionUrl,
        expectedMatchPort
      );
    }
  );
});
