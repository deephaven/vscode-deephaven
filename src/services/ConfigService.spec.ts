import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from './ConfigService';
import {
  CONFIG_KEY,
  MCP_DOCS_SERVER_NAME,
  MCP_DOCS_SERVER_URL,
  MCP_SERVER_NAME,
} from '../common';
import {
  getEnsuredContent,
  getWindsurfMcpConfigUri,
  isWindsurf,
} from '../util';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

vi.mock('../util', async () => {
  const actual = await vi.importActual<typeof import('../util')>('../util');
  return {
    ...actual,
    isWindsurf: vi.fn(),
    getEnsuredContent: vi.fn(),
    getWindsurfMcpConfigUri: vi.fn(),
  };
});

let configMap: vscode.WorkspaceConfiguration;

beforeEach(() => {
  vi.clearAllMocks();
  configMap = vscode.workspace.getConfiguration();
});

const urlA = 'http://someUrl';
const urlB = 'http://someOtherUrl';
const urlInvalid = 'invalidUrl';

describe('getCoreServers', () => {
  it.each([
    ['Empty config', [], []],
    [
      'String config',
      [urlA, urlB, urlInvalid],
      [{ url: new URL(urlA) }, { url: new URL(urlB) }],
    ],
    [
      'No label',
      [{ url: urlA }, { url: urlB }, { url: urlInvalid }],
      [{ url: new URL(urlA) }, { url: new URL(urlB) }],
    ],
    [
      'Full config',
      [
        { url: urlA, label: 'python' },
        { url: urlB, label: 'python' },
        { url: urlInvalid, label: 'python' },
      ],
      [
        { url: new URL(urlA), label: 'python' },
        { url: new URL(urlB), label: 'python' },
      ],
    ],
  ])('should return core servers: %s', (_label, given, expected) => {
    configMap.set(CONFIG_KEY.coreServers, given);

    const config = ConfigService.getCoreServers();

    expect(config).toEqual(expected);
  });
});

describe('getEnterpriseServers', () => {
  it.each([
    ['Empty config', [], []],
    [
      'String config',
      [urlA, urlB, urlInvalid],
      [{ url: new URL(urlA) }, { url: new URL(urlB) }],
    ],
  ])('should return enterprise servers: %s', (_label, given, expected) => {
    configMap.set(CONFIG_KEY.enterpriseServers, given);

    const config = ConfigService.getEnterpriseServers();

    expect(config).toEqual(expected);
  });
});

describe('toggleMcp', () => {
  it.each([
    { current: false, input: true, expected: true },
    { current: true, input: true, expected: null },
    { current: false, input: false, expected: null },
    { current: true, input: false, expected: false },
    { current: false, input: undefined, expected: true },
    { current: true, input: undefined, expected: false },
  ])(
    'should handle enable=$input, current=$current → expected=$expected',
    async ({ current, input, expected }) => {
      configMap.set(CONFIG_KEY.mcpEnabled, current);

      await ConfigService.toggleMcp(input);

      if (typeof expected === 'boolean') {
        expect(configMap.update).toHaveBeenCalledWith(
          CONFIG_KEY.mcpEnabled,
          expected,
          false
        );
      } else {
        expect(configMap.update).not.toHaveBeenCalled();
      }
    }
  );
});

describe('updateWindsurfMcpConfig', () => {
  const mockPort = 4000;
  const mockConfigUri = vscode.Uri.file(
    '/home/user/.codeium/windsurf/mcp_config.json'
  );

  beforeEach(() => {
    vi.mocked(getWindsurfMcpConfigUri).mockReturnValue(mockConfigUri);
  });

  it('should return false if not running in Windsurf', async () => {
    vi.mocked(isWindsurf).mockReturnValue(false);

    const result = await ConfigService.updateWindsurfMcpConfig(mockPort);

    expect(result).toBe(false);
    expect(isWindsurf).toHaveBeenCalled();
    expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'MCP disabled',
      port: mockPort,
      mcpEnabled: false,
      mcpDocsEnabled: true,
      existingServers: {
        [MCP_SERVER_NAME]: { serverUrl: 'http://localhost:3000/mcp' },
        [MCP_DOCS_SERVER_NAME]: { serverUrl: 'http://docs.example.com' },
      },
      expectedResult: true,
      expectedServers: {},
    },
    {
      label: 'port is null',
      port: null,
      mcpEnabled: true,
      mcpDocsEnabled: true,
      existingServers: {
        [MCP_SERVER_NAME]: { serverUrl: 'http://localhost:3000/mcp' },
        [MCP_DOCS_SERVER_NAME]: { serverUrl: 'http://docs.example.com' },
      },
      expectedResult: true,
      expectedServers: {
        [MCP_DOCS_SERVER_NAME]: { serverUrl: 'http://docs.example.com' },
      },
    },
    {
      label: 'both MCP and docs enabled',
      port: mockPort,
      mcpEnabled: true,
      mcpDocsEnabled: true,
      existingServers: {},
      expectedResult: true,
      expectedServers: {
        [MCP_SERVER_NAME]: { serverUrl: `http://localhost:${mockPort}/mcp` },
        [MCP_DOCS_SERVER_NAME]: { serverUrl: MCP_DOCS_SERVER_URL },
      },
    },
    {
      label: 'docs MCP disabled',
      port: mockPort,
      mcpEnabled: true,
      mcpDocsEnabled: false,
      existingServers: {
        [MCP_DOCS_SERVER_NAME]: { serverUrl: 'http://docs.example.com' },
      },
      expectedResult: true,
      expectedServers: {
        [MCP_SERVER_NAME]: { serverUrl: `http://localhost:${mockPort}/mcp` },
      },
    },
  ])(
    'should handle server config when $label',
    async ({
      port,
      mcpEnabled,
      mcpDocsEnabled,
      existingServers,
      expectedResult,
      expectedServers,
    }) => {
      vi.mocked(isWindsurf).mockReturnValue(true);
      configMap.set(CONFIG_KEY.mcpEnabled, mcpEnabled);
      configMap.set(CONFIG_KEY.mcpDocsEnabled, mcpDocsEnabled);
      configMap.set(CONFIG_KEY.mcpAutoUpdateConfig, true);

      const existingConfig = { mcpServers: existingServers };
      vi.mocked(getEnsuredContent).mockResolvedValue(
        JSON.stringify(existingConfig)
      );

      const result = await ConfigService.updateWindsurfMcpConfig(port);

      expect(result).toBe(expectedResult);
      expect(vscode.workspace.fs.writeFile).toHaveBeenCalledWith(
        mockConfigUri,
        Buffer.from(JSON.stringify({ mcpServers: expectedServers }, null, 2))
      );
    }
  );

  it('should return false if config has not changed', async () => {
    vi.mocked(isWindsurf).mockReturnValue(true);
    configMap.set(CONFIG_KEY.mcpEnabled, true);
    configMap.set(CONFIG_KEY.mcpDocsEnabled, true);

    const existingServers = {
      [MCP_SERVER_NAME]: { serverUrl: `http://localhost:${mockPort}/mcp` },
      [MCP_DOCS_SERVER_NAME]: { serverUrl: MCP_DOCS_SERVER_URL },
    };
    const existingConfig = { mcpServers: existingServers };
    vi.mocked(getEnsuredContent).mockResolvedValue(
      JSON.stringify(existingConfig)
    );

    const result = await ConfigService.updateWindsurfMcpConfig(mockPort);

    expect(result).toBe(false);
    expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'user accepts adding server',
      existingServers: {},
      userResponse: 'Yes',
      expectedResult: true,
      expectedPromptMessage:
        'Add Deephaven MCP servers to your Windsurf MCP config?',
      expectedPromptOptions: ['Yes', 'No'],
      shouldShowDocument: true,
      shouldUpdateAutoConfig: false,
    },
    {
      label: 'user chooses Always when updating',
      existingServers: {
        [MCP_SERVER_NAME]: { serverUrl: 'http://localhost:3000/mcp' },
      },
      userResponse: 'Always',
      expectedResult: true,
      expectedPromptMessage:
        'Update Deephaven MCP servers in your Windsurf MCP config?',
      expectedPromptOptions: ['Yes', 'Always', 'No'],
      shouldShowDocument: true,
      shouldUpdateAutoConfig: true,
    },
    {
      label: 'user declines prompt',
      existingServers: {},
      userResponse: 'No',
      expectedResult: false,
      expectedPromptMessage:
        'Add Deephaven MCP servers to your Windsurf MCP config?',
      expectedPromptOptions: ['Yes', 'No'],
      shouldShowDocument: false,
      shouldUpdateAutoConfig: false,
    },
  ])(
    'should handle prompts when $label',
    async ({
      existingServers,
      userResponse,
      expectedResult,
      expectedPromptMessage,
      expectedPromptOptions,
      shouldShowDocument,
      shouldUpdateAutoConfig,
    }) => {
      vi.mocked(isWindsurf).mockReturnValue(true);
      configMap.set(CONFIG_KEY.mcpEnabled, true);
      configMap.set(CONFIG_KEY.mcpDocsEnabled, true);
      configMap.set(CONFIG_KEY.mcpAutoUpdateConfig, false);

      const existingConfig = { mcpServers: existingServers };
      vi.mocked(getEnsuredContent).mockResolvedValue(
        JSON.stringify(existingConfig)
      );

      vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(
        userResponse as any
      );

      const result = await ConfigService.updateWindsurfMcpConfig(mockPort);

      expect(result).toBe(expectedResult);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expectedPromptMessage,
        ...expectedPromptOptions
      );

      if (shouldShowDocument) {
        expect(vscode.window.showTextDocument).toHaveBeenCalledWith(
          mockConfigUri
        );
      }

      if (shouldUpdateAutoConfig) {
        expect(configMap.update).toHaveBeenCalledWith(
          CONFIG_KEY.mcpAutoUpdateConfig,
          true,
          true
        );
      }

      if (!expectedResult) {
        expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
      }
    }
  );

  it('should handle errors and show error message', async () => {
    vi.mocked(isWindsurf).mockReturnValue(true);
    configMap.set(CONFIG_KEY.mcpEnabled, true);

    const error = new Error('File read failed');
    vi.mocked(getEnsuredContent).mockRejectedValue(error);

    const result = await ConfigService.updateWindsurfMcpConfig(mockPort);

    expect(result).toBe(false);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'Failed to update Windsurf MCP config: File read failed'
    );
  });

  it('should use USERPROFILE if HOME is not set', async () => {
    const windowsConfigUri = vscode.Uri.file(
      'C:\\Users\\TestUser/.codeium/windsurf/mcp_config.json'
    );
    vi.mocked(getWindsurfMcpConfigUri).mockReturnValue(windowsConfigUri);
    vi.mocked(isWindsurf).mockReturnValue(true);
    configMap.set(CONFIG_KEY.mcpEnabled, false);

    const existingConfig = { mcpServers: {} };
    vi.mocked(getEnsuredContent).mockResolvedValue(
      JSON.stringify(existingConfig)
    );

    await ConfigService.updateWindsurfMcpConfig(mockPort);

    expect(getEnsuredContent).toHaveBeenCalledWith(windowsConfigUri, '{}\n');
  });
});
