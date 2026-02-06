import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDheService, IServerManager, Psk, WorkerInfo } from '../../types';
import { getDhcPanelUrlFormat, getDhePanelUrlFormat } from './panelUtils';

vi.mock('vscode');

describe('getDhcPanelUrlFormat', () => {
  it.each([
    {
      name: 'without psk',
      url: 'http://localhost:10000',
      psk: undefined,
      expected: 'http://localhost:10000/iframe/widget/?name=<variableTitle>',
    },
    {
      name: 'with psk',
      url: 'http://localhost:10000',
      psk: 'test-psk-123' as Psk,
      expected:
        'http://localhost:10000/iframe/widget/?name=<variableTitle>&psk=test-psk-123',
    },
  ])(
    'should return correct panel URL format $name',
    ({ url, psk, expected }) => {
      const serverUrl = new URL(url);
      const result = getDhcPanelUrlFormat(serverUrl, psk);
      expect(result).toBe(expected);
    }
  );
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
      features: {
        createQueryIframe: true,
        embedDashboardsAndWidgets: false,
      },
      workerInfo: undefined,
      expected: undefined,
    },
    {
      scenario: 'embedDashboardsAndWidgets feature is not defined',
      dheService: mockDheService,
      features: { createQueryIframe: true },
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
      features: {
        createQueryIframe: true,
        embedDashboardsAndWidgets: true,
      },
      workerInfo: undefined,
      expected: undefined,
    },
    {
      scenario: 'all conditions are met',
      dheService: mockDheService,
      features: {
        createQueryIframe: true,
        embedDashboardsAndWidgets: true,
      },
      workerInfo: { serial: 'abc123' } as WorkerInfo,
      expected:
        'https://example.deephaven.io/iriside/embed/widget/serial/abc123/<variableTitle>',
    },
  ])(
    'should return $expected when $scenario',
    async ({ dheService, features, workerInfo, expected }) => {
      vi.mocked(mockDheService.getServerFeatures).mockReturnValue(
        features ? { version: 1, features } : undefined
      );

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
