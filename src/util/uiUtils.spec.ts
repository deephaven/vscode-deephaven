import * as vscode from 'vscode';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { Username } from '@deephaven-enterprise/auth-nodejs';
import {
  createConnectText,
  ConnectionOption,
  createConnectionOption,
  updateConnectionStatusBarItem,
  createConnectionQuickPickOptions,
  createSeparatorPickItem,
  promptForCredentials,
  promptForQueryStatusFilter,
  setViewIsFiltered,
} from './uiUtils';
import { UNSET_QUERY_STATUS, type ViewID } from '../common';
import type {
  ConnectionState,
  CoreConnectionConfig,
  IDhcService,
  IServerManager,
  ServerState,
} from '../types';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

const pythonServerConfig: CoreConnectionConfig = {
  label: 'python',
  url: new URL('http://localhost:10000'),
};

const groovyServerConfig: CoreConnectionConfig = {
  label: 'groovy',
  url: new URL('http://localhost:10001'),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createConnectionOption', () => {
  it.each([
    ['DHC', pythonServerConfig],
    ['DHC', groovyServerConfig],
  ] as const)(`should return connection option: '%s', %s`, (type, config) => {
    const actual = createConnectionOption(type)(config.url);
    expect(actual).toMatchSnapshot();
  });
});

describe('createConnectionQuickPickOptions', () => {
  const serverUrlA = new URL('http://localhost:10000');
  const serverUrlB = new URL('http://localhost:10001');
  const serverUrlC = new URL('http://localhost:10002');
  const serverUrlD = new URL('http://localhost:10003');

  it.each([
    ['No active', undefined],
    ['Active A', serverUrlA],
  ])(
    'should return quick pick options: editorActiveConnectionUrl=%s',
    async (_label, editorActiveConnectionUrl) => {
      const serversWithoutConnections: ServerState[] = [
        {
          type: 'DHC',
          url: serverUrlB,
          isConnected: false,
          isRunning: false,
          connectionCount: 0,
        },
        {
          type: 'DHC',
          url: serverUrlD,
          isConnected: false,
          isRunning: false,
          connectionCount: 0,
        },
      ];
      const connections: ConnectionState[] = [
        {
          label: 'ServerA Connection',
          serverUrl: serverUrlA,
          isConnected: true,
        },
        {
          label: 'ServerC Connection',
          serverUrl: serverUrlC,
          isConnected: true,
        },
      ];

      const serverManager = {
        getServerForConnection: vi.fn(
          (connection: ConnectionState): ServerState => ({
            type: 'DHC',
            url: connection.serverUrl,
            isConnected: true,
            isRunning: true,
            connectionCount: 1,
          })
        ),
        getWorkerInfo: vi.fn(async () => undefined),
      } as unknown as IServerManager;

      const actual = await createConnectionQuickPickOptions(
        serversWithoutConnections,
        connections,
        'python',
        serverManager,
        editorActiveConnectionUrl
      );
      expect(actual).toMatchSnapshot();
    }
  );

  it('should throw if no servers or connections', async () => {
    const servers: ServerState[] = [];
    const connections: IDhcService[] = [];

    const serverManager = {
      getServerForConnection: vi.fn(),
      getWorkerInfo: vi.fn(async () => undefined),
    } as unknown as IServerManager;

    await expect(
      createConnectionQuickPickOptions(
        servers,
        connections,
        'python',
        serverManager
      )
    ).rejects.toThrowError('No available servers to connect to.');
  });
});

describe('createConnectText', () => {
  const option: ConnectionOption = {
    type: 'DHC',
    label: 'DHC: localhost:10000',
    url: new URL('http://localhost:10000'),
  };

  const statuses = ['connecting', 'connected', 'disconnected'] as const;

  it.each(statuses)(`should return text and tooltip: '%s'`, status => {
    const actual = createConnectText(status, option);
    expect(actual).toMatchSnapshot();
  });
});

describe('updateConnectionStatusBarItem', () => {
  const option: ConnectionOption = {
    type: 'DHC',
    label: 'DHC: localhost:10000',
    url: new URL('http://localhost:10000'),
  };

  const statuses = ['connecting', 'connected', 'disconnected'] as const;

  it.each(statuses)(
    `should update connection status bar item: '%s'`,
    status => {
      const statusBarItem = {} as vscode.StatusBarItem;
      const text = createConnectText(status, option);

      updateConnectionStatusBarItem(statusBarItem, status, option);

      expect(statusBarItem.text).toBe(text);
    }
  );
});

describe('createSeparatorPickItem', () => {
  it('should create a separator quick pick item with label', () => {
    const label = 'Some Label';
    const actual = createSeparatorPickItem(label);
    expect(actual).toEqual({
      label,
      kind: vscode.QuickPickItemKind.Separator,
    });
  });
});

describe('promptForCredentials', () => {
  const title = 'mock.title';
  const username = 'mock.username' as Username;
  const token = 'mock.token';
  const operateAs = 'mock.operateAs';

  it.each([
    [
      'password',
      { title },
      [username, token],
      { type: 'password', token, username },
    ],
    ['password / cancelled username', { title }, [undefined], undefined],
    ['password / cancelled token', { title }, [username, undefined], undefined],
    [
      'password operateAs',
      { title, showOperateAs: true },
      [username, token, operateAs],
      { type: 'password', operateAs, token, username },
    ],
    [
      'password operateAs / cancelled username',
      { title, showOperateAs: true },
      [undefined],
      undefined,
    ],
    [
      'password operateAs / cancelled token',
      { title, showOperateAs: true },
      [username, undefined],
      undefined,
    ],
    [
      'password operateAs / cancelled operateAs',
      { title, showOperateAs: true },
      [username, token, undefined],
      undefined,
    ],
    [
      'privateKey',
      { title, privateKeyUserNames: [username] },
      [username],
      { type: 'keyPair', username },
    ],
    [
      'privateKey / cancelled username',
      { title, privateKeyUserNames: [username] },
      [undefined],
      undefined,
    ],
    [
      'privateKey operateAs',
      {
        title,
        privateKeyUserNames: [username],
        showOperateAs: true,
      },
      [username, operateAs],
      { type: 'keyPair', username, operateAs },
    ],
    [
      'privateKey operateAs / cancelled username',
      {
        title,
        privateKeyUserNames: [username],
        showOperateAs: true,
      },
      [undefined],
      undefined,
    ],
    [
      'privateKey operateAs / cancelled operateAs',
      {
        title,
        privateKeyUserNames: [username],
        showOperateAs: true,
      },
      [username, undefined],
      undefined,
    ],
  ])(
    'should prompt for username, password, and operateAs: %s',
    async (_label, arg, promptResponses, expected) => {
      for (const promptResponse of promptResponses) {
        vi.mocked(vscode.window.showInputBox).mockResolvedValueOnce(
          promptResponse
        );
      }

      const actual = await promptForCredentials(arg);
      expect(actual).toEqual(expected);
    }
  );
});

describe('setViewIsFiltered', () => {
  it.each([[true], [false]])(
    'should set the `${viewId}.isFiltered` context key: %s',
    isFiltered => {
      const viewId = 'mock.viewId' as ViewID;

      setViewIsFiltered(viewId, isFiltered);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'setContext',
        'mock.viewId.isFiltered',
        isFiltered
      );
    }
  );
});

describe('promptForQueryStatusFilter', () => {
  /** Grab the items the picker was shown, ignoring the options argument. */
  function shownItems(): {
    label: string;
    description?: string;
    picked?: boolean;
  }[] {
    return vi.mocked(vscode.window.showQuickPick).mock.calls[0][0] as never;
  }

  it('lists Running, then transitional, then terminal, then unset', async () => {
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue(
      undefined as never
    );

    await promptForQueryStatusFilter(new Map(), new Set());

    expect(shownItems().map(item => item.label)).toEqual([
      'Running',
      'Uninitialized',
      'Connecting',
      'Authenticating',
      'Acquiring Worker',
      'Finding Dispatcher',
      'Initializing',
      'Executing',
      'Stopping',
      'Stopped',
      'Failed',
      'Error',
      'Disconnected',
      'Completed',
      '(no status)',
    ]);
  });

  it('is a multi-select picker (canPickMany, not canSelectMany)', async () => {
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue(
      undefined as never
    );

    await promptForQueryStatusFilter(new Map(), new Set());

    expect(
      vi.mocked(vscode.window.showQuickPick).mock.calls[0][1]
    ).toMatchObject({
      canPickMany: true,
      ignoreFocusOut: true,
      placeHolder: 'Select the query statuses to show',
    });
  });

  it('shows counts (0 when absent) and checks the statuses that are not hidden', async () => {
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue(
      undefined as never
    );

    await promptForQueryStatusFilter(
      new Map([
        ['Running', 13],
        [UNSET_QUERY_STATUS, 2],
      ]),
      new Set(['Stopped', UNSET_QUERY_STATUS])
    );

    const byLabel = new Map(shownItems().map(item => [item.label, item]));

    expect(byLabel.get('Running')).toMatchObject({
      description: '13',
      picked: true,
    });
    expect(byLabel.get('(no status)')).toMatchObject({
      description: '2',
      picked: false,
    });
    expect(byLabel.get('Stopped')).toMatchObject({
      description: '0',
      picked: false,
    });
    expect(byLabel.get('Connecting')).toMatchObject({
      description: '0',
      picked: true,
    });
  });

  it('gives a row to a status it does not recognize, alphabetized before the unset row', async () => {
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue(
      undefined as never
    );

    await promptForQueryStatusFilter(
      new Map([
        ['Zombie', 1],
        ['Hibernating', 3],
      ]),
      new Set()
    );

    const labels = shownItems().map(item => item.label);
    expect(labels.slice(-3)).toEqual(['Hibernating', 'Zombie', '(no status)']);
  });

  it('returns the statuses that were NOT picked (the hidden set)', async () => {
    vi.mocked(vscode.window.showQuickPick).mockImplementation(
      (async (items: { status: string }[]) =>
        items.filter(item => item.status === 'Running')) as never
    );

    const hidden = await promptForQueryStatusFilter(new Map(), new Set());

    expect(hidden).toBeDefined();
    expect(hidden?.has('Running')).toBe(false);
    expect(hidden?.has('Stopped')).toBe(true);
    expect(hidden?.has(UNSET_QUERY_STATUS)).toBe(true);
  });

  it('returns an empty hidden set when everything is picked', async () => {
    vi.mocked(vscode.window.showQuickPick).mockImplementation(
      (async (items: unknown[]) => items) as never
    );

    const hidden = await promptForQueryStatusFilter(new Map(), new Set());

    expect(hidden?.size).toBe(0);
  });

  it('returns undefined when the picker is dismissed, so the caller leaves the filter alone', async () => {
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue(
      undefined as never
    );

    expect(
      await promptForQueryStatusFilter(new Map(), new Set(['Stopped']))
    ).toBeUndefined();
  });
});
