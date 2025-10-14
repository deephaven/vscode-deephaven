import * as vscode from 'vscode';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import {
  getSetExecutionContextScript,
  isPluginInstalled,
  registerRemoteFileSourcePluginMessageListener,
  sendWidgetMessageAsync,
} from './remoteFileSourceUtils';
import type {
  JsonRpcFetchModuleRequest,
  JsonRpcRequest,
  JsonRpcResponse,
  ModuleFullname,
  UniqueID,
} from '../types';
import { getLastEventListener } from '../testUtils';

vi.mock('vscode');

const mockIncomingMsg = (msg: JsonRpcResponse | JsonRpcRequest): void => {
  vi.mocked(mockPlugin.getDataAsString).mockReturnValueOnce(
    JSON.stringify(msg)
  );
};

const removeEventListener = vi.fn().mockName('removeEventListener');

const mockPlugin = {
  addEventListener: vi.fn().mockName('addEventListener'),
  getDataAsString: vi.fn().mockName('getDataAsString'),
  sendMessage: vi.fn().mockName('sendMessage'),
} as unknown as DhcType.Widget;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mockPlugin.addEventListener).mockReturnValue(removeEventListener);
});

describe('getSetExecutionContextScript', () => {
  it.each([
    [null, [], '__deephaven_vscode.set_execution_context(None, {})'],
    [
      'cn1' as UniqueID,
      ['aaa', 'bbb'],
      '__deephaven_vscode.set_execution_context(\'cn1\', {"aaa","bbb"})',
    ],
  ])(
    'should return a Python script that can set execution context: %s, %s',
    (cnId, moduleFullNames, expected) => {
      const script = getSetExecutionContextScript(cnId, moduleFullNames);
      expect(script).toBe(expected);
    }
  );
});

describe('isPluginInstalled', () => {
  const existingPluginName = 'my-plugin';
  const nonExistingPluginName = 'non-existing-plugin';
  const workerUrl = new URL('http://mock-worker-url/');

  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      json: async () => ({
        plugins: [{ name: 'other-plugin' }, { name: existingPluginName }],
      }),
    } as Response);
  });

  it.each([
    [existingPluginName, true],
    [nonExistingPluginName, false],
  ])(
    'should return true if the plugin is installed',
    async (pluginName, expected) => {
      const result = await isPluginInstalled(workerUrl, pluginName);

      expect(result).toBe(expected);
    }
  );

  it('should return false if there is an error checking for the plugin', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const result = await isPluginInstalled(workerUrl, existingPluginName);

    expect(result).toBe(false);
  });
});

describe('registerRemoteFileSourcePluginMessageListener', () => {
  const getModuleFilePath =
    vi.fn<(moduleFullname: ModuleFullname) => vscode.Uri | undefined>();

  const mockFile = {
    exists: {
      moduleName: 'a.b.c' as ModuleFullname,
      uri: vscode.Uri.parse('file:///some/path/a/b/c.py'),
      source: 'mock source code from a/b/c.py',
    },
    notExists: {
      moduleName: 'a.b.c' as ModuleFullname,
      uri: undefined,
      source: undefined,
    },
  } as const;

  const mockMsg = {
    fetchModuleReq: (moduleName: string): JsonRpcFetchModuleRequest => ({
      jsonrpc: '2.0',
      id: '1',
      method: 'fetch_module',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      params: { module_name: moduleName as ModuleFullname },
    }),
    fetchModuleRes: (file: {
      moduleName: ModuleFullname;
      uri: vscode.Uri | undefined;
      source: string | undefined;
    }): JsonRpcResponse => ({
      jsonrpc: '2.0',
      id: '1',
      result: {
        filepath: file.uri?.fsPath ?? '<string>',
        source: file.source,
      },
    }),
  } as const;

  beforeEach(() => {
    vi.mocked(vscode.workspace.openTextDocument).mockImplementation(
      async (uri): Promise<vscode.TextDocument> => {
        const path =
          typeof uri === 'string'
            ? uri
            : uri instanceof vscode.Uri
              ? uri.fsPath
              : '';
        const file = Object.values(mockFile).find(f => f.uri?.fsPath === path);
        const text = file?.source ?? '';
        return {
          getText: () => text,
        } as vscode.TextDocument;
      }
    );
  });

  it.each([[mockFile.exists], [mockFile.notExists]])(
    'should register a message listener for the remote file source plugin: %s',
    async file => {
      mockIncomingMsg(mockMsg.fetchModuleReq(file.moduleName));
      getModuleFilePath.mockReturnValueOnce(file.uri);

      registerRemoteFileSourcePluginMessageListener(
        mockPlugin,
        getModuleFilePath
      );

      const msgHandler = getLastEventListener(
        'message',
        mockPlugin.addEventListener<DhcType.Widget>
      );

      await msgHandler({ type: 'message', detail: mockPlugin });

      expect(mockPlugin.sendMessage).toHaveBeenCalledWith(
        JSON.stringify(mockMsg.fetchModuleRes(file))
      );
    }
  );
});

describe('sendWidgetMessageAsync', () => {
  it('should return a Promise that resolves when a response is received', async () => {
    const id = '999';
    const matchingMsg = {
      jsonrpc: '2.0',
      id,
      result: null,
    } as JsonRpcResponse;
    const nonMatchingMsg = {
      jsonrpc: '2.0',
      id: 'not-matching',
      result: null,
    } as JsonRpcResponse;

    const promise = sendWidgetMessageAsync(mockPlugin, {
      jsonrpc: '2.0',
      id,
      method: 'set_connection_id',
    });

    const msgHandler = getLastEventListener(
      'message',
      mockPlugin.addEventListener<DhcType.Widget>
    );

    mockIncomingMsg(nonMatchingMsg);
    msgHandler({ type: 'message', detail: mockPlugin });

    mockIncomingMsg(matchingMsg);
    msgHandler({ type: 'message', detail: mockPlugin });

    const response = await promise;
    expect(response).toEqual(matchingMsg);
    expect(removeEventListener).toHaveBeenCalled();
  });
});
