import * as vscode from 'vscode';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import {
  getFileTreeItem,
  getFolderTreeItem,
  getSetExecutionContextScript,
  getTopLevelMarkedFolderTreeItem,
  getTopLevelModuleFullname,
  hasPythonPluginVariable,
  registerRemoteFileSourcePluginMessageListener,
  sendWidgetMessageAsync,
} from './remoteFileSourceUtils';
import type {
  JsonRpcFetchModuleRequest,
  JsonRpcRequest,
  JsonRpcResponse,
  PythonModuleFullname,
  PythonModuleSpecData,
  RemoteImportSourceTreeFileElement,
  RemoteImportSourceTreeFolderElement,
  RemoteImportSourceTreeTopLevelMarkedFolderElement,
  UniqueID,
} from '../types';
import { getLastEventListener } from '../testUtils';
import * as Msg from './remoteFileSourceMsgUtils';
import {
  DH_PYTHON_REMOTE_SOURCE_PLUGIN_CLASS,
  DH_PYTHON_REMOTE_SOURCE_PLUGIN_VARIABLE,
} from '../common';

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

describe('getFileTreeItem', () => {
  it('should return a TreeItem for a file element', () => {
    const element = {
      name: 'mock.py',
      uri: vscode.Uri.parse('file:///mock/file/path.py'),
    } as RemoteImportSourceTreeFileElement;

    expect(getFileTreeItem(element)).toMatchSnapshot();
  });
});

describe('getFolderTreeItem', () => {
  it.each([true, false])(
    'should return a TreeItem for a folder element. isMarked:%s',
    isMarked => {
      const element = {
        name: 'mockFolder',
        isMarked,
        uri: vscode.Uri.parse('file:///mock/folder/path/'),
      } as RemoteImportSourceTreeFolderElement;

      expect(getFolderTreeItem(element)).toMatchSnapshot();
    }
  );
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

describe('getTopLevelMarkedFolderTreeItem', () => {
  it('should return a TreeItem for a top-level marked folder element', () => {
    const element = {
      uri: vscode.Uri.parse('file:///mock/top/level/marked/folder/'),
    } as RemoteImportSourceTreeTopLevelMarkedFolderElement;

    expect(getTopLevelMarkedFolderTreeItem(element)).toMatchSnapshot();
  });
});

describe('getTopLevelModuleFullname', () => {
  it.each([
    ['file:///mock/trailing-slash/', 'trailing-slash'],
    ['file:///mock/module', 'module'],
  ])(
    'should return the top-level module fullname for a given folder URI: %s',
    (uriPath, expectedModuleName) => {
      const result = getTopLevelModuleFullname(vscode.Uri.parse(uriPath));
      expect(result).toBe(expectedModuleName);
    }
  );
});

describe('hasPythonPluginVariable', () => {
  it.each([
    [
      [
        { name: 'other_variable', type: 'SomeType' },
        {
          name: DH_PYTHON_REMOTE_SOURCE_PLUGIN_VARIABLE,
          type: DH_PYTHON_REMOTE_SOURCE_PLUGIN_CLASS,
        },
      ] as DhcType.ide.VariableDefinition[],
      true,
    ],
    [
      [
        { name: 'other_variable', type: 'SomeType' },
        {
          name: DH_PYTHON_REMOTE_SOURCE_PLUGIN_VARIABLE,
          type: 'WrongType',
        },
      ] as DhcType.ide.VariableDefinition[],
      false,
    ],
    [
      [
        { name: 'other_variable', type: 'SomeType' },
      ] as DhcType.ide.VariableDefinition[],
      false,
    ],
  ])(
    'should check if the Python remote file source plugin variable is present: %o',
    (variables, expected) => {
      const result = hasPythonPluginVariable(variables);
      expect(result).toBe(expected);
    }
  );
});

describe('registerRemoteFileSourcePluginMessageListener', () => {
  const getPythonModuleSpecData =
    vi.fn<
      (moduleFullname: PythonModuleFullname) => PythonModuleSpecData | null
    >();

  const mockModuleName = 'a.b.c' as PythonModuleFullname;

  const mockFile = {
    exists: {
      name: mockModuleName,
      isPackage: false,
      origin: 'file:///some/path/a/b/c.py',
      source: 'mock source code from a/b/c.py',
    },
    notExists: null,
  } as const satisfies Record<
    string,
    (PythonModuleSpecData & { source?: string }) | null
  >;

  const mockMsg = {
    fetchModuleReq: (moduleName: string): JsonRpcFetchModuleRequest => ({
      jsonrpc: '2.0',
      id: '1',
      method: 'fetch_module',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      params: { module_name: moduleName as PythonModuleFullname },
    }),
    fetchModuleRes: ({
      source,
      ...spec
    }: PythonModuleSpecData & { source?: string }) =>
      Msg.moduleSpecResponse('1', spec, source),
    fetchModuleErrRes: () => Msg.moduleSpecErrorResponse('1', mockModuleName),
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
        const file = Object.values(mockFile).find(f => f?.origin === path);
        const text = file?.source ?? '';
        return {
          getText: () => text,
        } as vscode.TextDocument;
      }
    );
  });

  it.each([[mockFile.exists], [mockFile.notExists]])(
    'should register a message listener for the remote file source plugin: %s',
    async spec => {
      mockIncomingMsg(mockMsg.fetchModuleReq(mockModuleName));
      getPythonModuleSpecData.mockReturnValueOnce(spec);

      registerRemoteFileSourcePluginMessageListener(
        mockPlugin,
        getPythonModuleSpecData
      );

      const msgHandler = getLastEventListener(
        'message',
        mockPlugin.addEventListener<DhcType.Widget>
      );

      await msgHandler({ type: 'message', detail: mockPlugin });

      const response =
        spec == null
          ? mockMsg.fetchModuleErrRes()
          : mockMsg.fetchModuleRes(spec);

      expect(mockPlugin.sendMessage).toHaveBeenCalledWith(
        JSON.stringify(response)
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
