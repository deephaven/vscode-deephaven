import { describe, it, expect, vi } from 'vitest';
import type * as vscode from 'vscode';
import { bitValues, boolValues, matrix } from '../testUtils';
import {
  canBrowsePersistentQueryObjects,
  getConnectionServerTreeItem,
  getPanelConnectionTreeItem,
  getPanelVariableLeaves,
  getPanelVariableTreeItem,
  getPersistentQueryGroup,
  getPersistentQueryGroupTreeItem,
  getPersistentQueryNodeIconId,
  getPersistentQueryObjectLeaves,
  getPersistentQueryLanguageIconId,
  getPersistentQueryServerTreeItem,
  getPersistentQueryStatus,
  getPersistentQueryTreeItem,
  isPersistentQueryGroupNode,
  isPersistentQueryNode,
  getWorkerNodeLabel,
  persistentQueryHasTables,
  getServerContextValue,
  getServerDescription,
  getServerGroupContextValue,
  getServerGroupTreeItem,
  getServerIconID,
  getServerTreeItem,
  getVariableIconPath,
  groupServers,
} from './treeViewUtils';
import type {
  ConsoleType,
  IDhcService,
  IPanelService,
  Psk,
  ServerState,
  VariableDefintion,
  VariableType,
} from '../types';
import { isInstanceOf } from './isInstanceOf';
import { DH_PROTECTED_VARIABLE_NAMES } from '../common';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');
vi.mock('../util/isInstanceOf.ts');

const variableTypes: readonly VariableType[] = [
  'deephaven.plot.express.DeephavenFigure',
  'deephaven.ui.Element',
  'Figure',
  'HierarchicalTable',
  'OtherWidget',
  'pandas.DataFrame',
  'PartitionedTable',
  'Table',
  'TableMap',
  'Treemap',
  'TreeTable',
] as const;

describe('getPanelConnectionTreeItem', () => {
  const getConsoleTypes: IDhcService['getConsoleTypes'] = vi
    .fn()
    .mockResolvedValue(new Set<ConsoleType>(['python']));

  const serverUrl = new URL('http://localhost:10000');

  it.each(matrix(boolValues, boolValues))(
    'should return panel connection tree item: isConnected:%s, isInitialized:%s',
    async (isConnected, isInitialized) => {
      const connection = {
        isConnected,
        isInitialized,
        serverUrl,
        getConsoleTypes,
      } as IDhcService;

      vi.mocked(isInstanceOf).mockReturnValue(true);

      const actual = await getPanelConnectionTreeItem(
        connection,
        async () => {
          const [consoleType] = await getConsoleTypes();
          return isInitialized ? consoleType : undefined;
        },
        'Some Worker Label'
      );
      expect(actual).toMatchSnapshot();
    }
  );
});

describe('getConnectionServerTreeItem', () => {
  it('should return a labeled server tree item', () => {
    const server: ServerState = {
      type: 'DHE',
      url: new URL('https://my-dhe-server:8123'),
      label: 'My DHE Server',
      isConnected: true,
      isRunning: true,
      connectionCount: 2,
    };

    expect(getConnectionServerTreeItem(server)).toMatchSnapshot();
  });

  it('should fall back to the url host when there is no label', () => {
    const server: ServerState = {
      type: 'DHE',
      url: new URL('https://my-dhe-server:8123'),
      isConnected: true,
      isRunning: true,
      connectionCount: 2,
    };

    expect(getConnectionServerTreeItem(server)).toMatchSnapshot();
  });
});

describe('getWorkerNodeLabel', () => {
  it.each([
    [
      'clips the trailing id of a Code Studio worker',
      'Code Studio - Web - l9hnYDTiEosKmJwe4Fma5',
      'Code Studio - Web - l9hnYD',
    ],
    [
      'clips the trailing id of a VS Code worker',
      'IC - VS Code - KM7lskRLXCESeQpTBPSTB',
      'IC - VS Code - KM7lsk',
    ],
    ['leaves a name with no id segment alone', 'IC - VS Code', 'IC - VS Code'],
    [
      'leaves a short trailing segment alone',
      'Code Studio - Web - abc',
      'Code Studio - Web - abc',
    ],
    [
      'leaves a trailing segment containing whitespace alone',
      'A - B - two words',
      'A - B - two words',
    ],
    ['leaves an unstructured name alone', 'my worker', 'my worker'],
  ])('%s', (_label, input, expected) => {
    expect(getWorkerNodeLabel(input)).toBe(expected);
  });
});

describe('getPanelVariableLeaves', () => {
  const serverUrl = new URL('http://localhost:10000');

  const makePanelService = (variables: unknown[]): IPanelService =>
    ({ getVariables: () => variables }) as unknown as IPanelService;

  it('drops variables that cannot open as a panel', () => {
    const panelService = makePanelService([
      { id: 'v1', title: 't1', name: 't1', type: 'Table' },
      { id: 'v2', title: 'acl', name: 'acl', type: 'AclService' },
    ]);

    expect(
      getPanelVariableLeaves(panelService, serverUrl).map(
        ([, variable]) => variable.title
      )
    ).toEqual(['t1']);
  });

  it('sorts the leaves by title and pairs each with the worker url', () => {
    const panelService = makePanelService([
      { id: 'v1', title: 'c', name: 'c', type: 'Table' },
      { id: 'v2', title: 'a', name: 'a', type: 'Figure' },
      { id: 'v3', title: 'b', name: 'b', type: 'Table' },
    ]);

    expect(getPanelVariableLeaves(panelService, serverUrl)).toEqual([
      [serverUrl, { id: 'v2', title: 'a', name: 'a', type: 'Figure' }],
      [serverUrl, { id: 'v3', title: 'b', name: 'b', type: 'Table' }],
      [serverUrl, { id: 'v1', title: 'c', name: 'c', type: 'Table' }],
    ]);
  });
});

describe('getPanelVariableTreeItem', () => {
  const url = new URL('http://localhost:10000');

  it.each(variableTypes)(
    'should return panel variable tree item: type:%s',
    type => {
      const variable = {
        title: 'some title',
        type,
      } as VariableDefintion;

      const actual = getPanelVariableTreeItem([url, variable], true);
      expect(actual).toMatchSnapshot();
    }
  );

  it('offers the delete action when the variable can be deleted', () => {
    const variable = {
      title: 'some title',
      name: 'some_name',
      type: 'Table',
    } as VariableDefintion;

    expect(getPanelVariableTreeItem([url, variable], true).contextValue).toBe(
      'canDeleteDeephavenVariable'
    );
  });

  it('offers no delete action for a browse-only (PQ) object', () => {
    const variable = {
      title: 'some title',
      name: 'some_name',
      type: 'Table',
    } as VariableDefintion;

    expect(
      getPanelVariableTreeItem([url, variable], false).contextValue
    ).toBeUndefined();
  });

  it('offers no delete action for a protected variable name', () => {
    const [protectedName] = DH_PROTECTED_VARIABLE_NAMES;
    const variable = {
      title: 'some title',
      name: protectedName,
      type: 'Table',
    } as VariableDefintion;

    expect(
      getPanelVariableTreeItem([url, variable], true).contextValue
    ).toBeUndefined();
  });
});

describe('getServerContextValue', () => {
  it.each(matrix(boolValues, boolValues, boolValues, boolValues))(
    'should return contextValue based on server state: isConnected=%s, isConnecting=%s, isManaged=%s, isRunning=%s',
    (isConnected, isConnecting, isManaged, isRunning) => {
      const actual = getServerContextValue({
        isConnected,
        isConnecting,
        isDHE: false,
        isManaged,
        isRunning,
      });
      expect(actual).toMatchSnapshot();
    }
  );
});

describe('getServerDescription', () => {
  const labelValeus = ['some label', undefined] as const;

  it.each(matrix(bitValues, boolValues, labelValeus))(
    'should return server description based on parameters: connectionCount=%s, isManaged=%s, label=%s',
    (connectionCount, isManaged, label) => {
      const actual = getServerDescription(connectionCount, isManaged, label);
      expect(actual).toMatchSnapshot();
    }
  );
});

describe('getServerGroupContextValue', () => {
  const groupValues = ['Managed', 'Running'] as const;

  it.each(matrix(groupValues, boolValues))(
    'should return context value when servers can be managed: group=%s, canStartServer=%s',
    (group, canStartServer) => {
      const actual = getServerGroupContextValue(group, canStartServer);
      expect(actual).toMatchSnapshot();
    }
  );
});

describe('getServerGroupTreeItem', () => {
  const groupValues = ['Managed', 'Running'] as const;

  it.each(matrix(groupValues, boolValues))(
    'should return server group tree item: group=%s, canStartServer=%s',
    (group, canStartServer) => {
      const actual = getServerGroupTreeItem(group, canStartServer);
      expect(actual).toMatchSnapshot();
    }
  );
});

describe('getServerIconID', () => {
  it.each(matrix(boolValues, boolValues, boolValues, boolValues))(
    'should return icon id based on server state: isConnected=%s, isConnecting=%s, isManaged=%s, isRunning=%s',
    (isConnected, isConnecting, isManaged, isRunning) => {
      const actual = getServerIconID({
        isConnected,
        isConnecting,
        isManaged,
        isRunning,
      });
      expect(actual).toMatchSnapshot();
    }
  );
});

describe('getServerTreeItem', () => {
  const typeValues = ['DHC', 'DHE'] as const;

  const dhcServerState: ServerState = {
    type: 'DHC',
    url: new URL('http://localhost:10000'),
    isConnected: false,
    isRunning: false,
    connectionCount: 0,
  };

  it.each(matrix(typeValues, boolValues, boolValues, boolValues, boolValues))(
    'should return server tree item: type=%s, isConnected=%s, isConnecting=%s, isManaged=%s, isRunning=%s',
    (type, isConnected, isConnecting, isManaged, isRunning) => {
      const actual = getServerTreeItem(
        {
          ...dhcServerState,
          ...(isManaged
            ? { isManaged: true, psk: 'mock.psk' as Psk }
            : { isManaged: false }),
          type,
          connectionCount: isConnected ? 1 : 0,
          isConnected,
          isRunning,
        },
        isConnecting
      );

      expect(actual).toMatchSnapshot();
    }
  );
});

describe('getVariableIconPath', () => {
  it('should return icon path for variableType', () => {
    expect(
      variableTypes.map(type => [type, getVariableIconPath(type)])
    ).toMatchSnapshot();
  });
});

describe('groupServers', () => {
  it('should group servers by state', () => {
    // Note that each combination is duplicated so that multiple servers get
    // created for each group.
    const props = matrix(boolValues, [true, true, false, false]);

    const servers = props.map(
      ([isManaged, isRunning], i) =>
        ({
          type: 'DHC' as const,
          url: new URL(`http://localhost:1000${i}`),
          isManaged,
          isRunning,
          psk: isManaged ? 'mock.psk' : undefined,
        }) as ServerState
    );

    const actual = groupServers(servers);

    expect(actual).toMatchSnapshot();
  });
});

describe('getPersistentQueryGroup', () => {
  const makeQueryInfo = (
    status: string | null | undefined
  ): Parameters<typeof getPersistentQueryGroup>[0] =>
    ({ designated: { status } }) as unknown as Parameters<
      typeof getPersistentQueryGroup
    >[0];

  it('groups a Running PQ under Running', () => {
    expect(getPersistentQueryGroup(makeQueryInfo('Running'))).toBe('Running');
  });

  it.each([['Initializing'], ['Connecting'], ['Queued']])(
    'groups a transitional PQ under Running: %s',
    status => {
      expect(getPersistentQueryGroup(makeQueryInfo(status))).toBe('Running');
    }
  );

  it.each([
    ['Stopped'],
    ['Stopping'],
    ['Failed'],
    ['Error'],
    ['Disconnected'],
    ['Completed'],
  ])('groups a terminal PQ under Stopped: %s', status => {
    expect(getPersistentQueryGroup(makeQueryInfo(status))).toBe('Stopped');
  });

  it.each([[null], [undefined], ['']])(
    'groups an unset status under Stopped (a stopped PQ may report none): %s',
    status => {
      expect(
        getPersistentQueryGroup(makeQueryInfo(status as string | null))
      ).toBe('Stopped');
    }
  );

  it('groups a PQ with no designated worker under Stopped', () => {
    const queryInfo = {} as unknown as Parameters<
      typeof getPersistentQueryGroup
    >[0];
    expect(getPersistentQueryGroup(queryInfo)).toBe('Stopped');
  });
});

describe('getPersistentQueryNodeIconId', () => {
  const makeQueryInfo = (
    status: string | null | undefined,
    scriptLanguage: string | null = 'Python'
  ): Parameters<typeof getPersistentQueryNodeIconId>[0] =>
    ({ designated: { status }, scriptLanguage }) as unknown as Parameters<
      typeof getPersistentQueryNodeIconId
    >[0];

  it.each([['Running'], ['Stopped'], ['Failed'], [null], [undefined], ['']])(
    'shows the language icon when the group already carries the status: %s',
    status => {
      expect(
        getPersistentQueryNodeIconId(makeQueryInfo(status as string | null))
      ).toBe('dh-python');
    }
  );

  it.each([['Initializing'], ['Connecting'], ['Queued']])(
    'shows the spinner for a transitional status: %s',
    status => {
      expect(getPersistentQueryNodeIconId(makeQueryInfo(status))).toBe(
        'sync~spin'
      );
    }
  );

  it('falls back to the worker icon for an unknown language', () => {
    expect(getPersistentQueryNodeIconId(makeQueryInfo('Running', null))).toBe(
      'remote'
    );
  });
});

describe('getPersistentQueryGroupTreeItem', () => {
  it.each([['Running'], ['Stopped']] as const)(
    'renders the %s group',
    group => {
      const item = getPersistentQueryGroupTreeItem(
        { dheServerUrl: new URL('https://dhe.example.com/'), group },
        3
      );
      expect(item).toMatchSnapshot();
    }
  );
});

describe('isPersistentQueryGroupNode', () => {
  it('is true for a node carrying a group', () => {
    expect(
      isPersistentQueryGroupNode({
        dheServerUrl: new URL('https://dhe.example.com/'),
        group: 'Running',
      })
    ).toBe(true);
  });

  it('is false for a persistent query node', () => {
    expect(
      isPersistentQueryGroupNode({
        dheServerUrl: new URL('https://dhe.example.com/'),
        queryInfo: {},
      } as unknown as Parameters<typeof isPersistentQueryGroupNode>[0])
    ).toBe(false);
  });
});

describe('getPersistentQueryLanguageIconId', () => {
  it.each([
    ['Python', 'dh-python'],
    ['python', 'dh-python'],
    ['Groovy', 'coffee'],
    ['groovy', 'coffee'],
  ])(
    'returns the language icon: scriptLanguage=%s',
    (scriptLanguage, expected) => {
      expect(getPersistentQueryLanguageIconId(scriptLanguage)).toBe(expected);
    }
  );

  it.each([[null], [undefined], [''], ['Scala']])(
    'falls back to the generic worker icon when the language is unknown: %s',
    scriptLanguage => {
      expect(
        getPersistentQueryLanguageIconId(scriptLanguage as string | null)
      ).toBe('remote');
    }
  );
});

describe('getPersistentQueryStatus', () => {
  const makeQueryInfo = (
    overrides: Record<string, unknown>
  ): Parameters<typeof getPersistentQueryStatus>[0] =>
    overrides as unknown as Parameters<typeof getPersistentQueryStatus>[0];

  it('returns the designated worker status', () => {
    expect(
      getPersistentQueryStatus(
        makeQueryInfo({ designated: { status: 'Running' } })
      )
    ).toBe('Running');
  });

  it('returns undefined when there is no designated worker', () => {
    expect(getPersistentQueryStatus(makeQueryInfo({}))).toBeUndefined();
  });
});

describe('isPersistentQueryNode', () => {
  it('is true for a node carrying queryInfo', () => {
    const node = {
      dheServerUrl: new URL('https://dhe.example.com/'),
      queryInfo: { name: 'PQ' },
    } as unknown as Parameters<typeof isPersistentQueryNode>[0];
    expect(isPersistentQueryNode(node)).toBe(true);
  });

  it('is false for a server state node', () => {
    const server = { url: new URL('https://dhe.example.com/') } as ServerState;
    expect(isPersistentQueryNode(server)).toBe(false);
  });
});

describe('getPersistentQueryTreeItem', () => {
  /** The designated-worker endpoints a browsable PQ must have. */
  const browsableUrls = {
    jsApiUrl: 'https://dhe.example.com/worker/1/jsapi/dh-core.js',
    ideUrl: 'https://dhe.example.com/worker/1/ide',
  };

  function makeNode(
    designated: unknown,
    scriptLanguage = 'Python'
  ): Parameters<typeof getPersistentQueryTreeItem>[0] {
    return {
      dheServerUrl: new URL('https://dhe.example.com/'),
      queryInfo: { name: 'My PQ', owner: 'alice', designated, scriptLanguage },
    } as unknown as Parameters<typeof getPersistentQueryTreeItem>[0];
  }

  it('renders name + owner + context value', () => {
    const item = getPersistentQueryTreeItem(
      makeNode({
        ...browsableUrls,
        status: 'Running',
        objects: [{ title: 't1', type: 'Table' }],
      })
    );
    expect(item.label).toBe('My PQ');
    expect(item.description).toBe('alice');
    expect(item.contextValue).toBe('isPersistentQuery');
  });

  it('renders the script language icon', () => {
    const item = getPersistentQueryTreeItem(
      makeNode({ status: 'Running', objects: [] }, 'Groovy')
    );
    expect((item.iconPath as vscode.ThemeIcon).id).toBe('coffee');
  });

  it('renders the language icon for a stopped PQ (status is on the group)', () => {
    const item = getPersistentQueryTreeItem(
      makeNode({ status: 'Stopped', objects: [] })
    );
    expect((item.iconPath as vscode.ThemeIcon).id).toBe('dh-python');
  });

  it('renders the spinner for a transitional PQ', () => {
    const item = getPersistentQueryTreeItem(
      makeNode({ status: 'Initializing', objects: [] })
    );
    expect((item.iconPath as vscode.ThemeIcon).id).toBe('sync~spin');
  });

  it('is collapsible when the PQ exposes browsable objects (Collapsed = 1)', () => {
    const item = getPersistentQueryTreeItem(
      makeNode({
        ...browsableUrls,
        status: 'Running',
        objects: [
          { title: 't1', type: 'Table' },
          { title: 'f1', type: 'Figure' },
        ],
      })
    );
    expect(item.collapsibleState).toBe(1);
    // Object + table counts surfaced in the tooltip (no expansion needed).
    expect(item.tooltip).toBe('My PQ (Running) — 2 objects (1 table)');
  });

  it.each([
    ['no ideUrl (e.g. a RevertHelper query)', { ideUrl: null }],
    ['an empty ideUrl', { ideUrl: '' }],
    ['no jsApiUrl', { jsApiUrl: null }],
  ])(
    'is non-expandable when the objects cannot be opened: %s',
    (_label, overrides) => {
      const item = getPersistentQueryTreeItem(
        makeNode({
          ...browsableUrls,
          ...overrides,
          status: 'Running',
          objects: [{ title: 't1', type: 'Table' }],
        })
      );
      expect(item.collapsibleState).toBe(0);
      expect(item.tooltip).toBe(
        'My PQ (Running) — 1 object (1 table) (worker not browsable)'
      );
    }
  );

  it('ignores object entries with an empty title or type', () => {
    const item = getPersistentQueryTreeItem(
      makeNode({
        ...browsableUrls,
        status: 'Running',
        objects: [
          { title: '', type: 'Table' },
          { title: 't1', type: '' },
        ],
      })
    );
    expect(item.collapsibleState).toBe(0);
    expect(item.tooltip).toBe('My PQ (Running) — no objects');
  });

  it('ignores objects whose type is not an openable panel', () => {
    const item = getPersistentQueryTreeItem(
      makeNode({
        ...browsableUrls,
        status: 'Running',
        objects: [
          { title: 'd1', type: 'deephaven.ui.Dashboard' },
          { title: 'm1', type: 'TableMap' },
          { title: 'tm1', type: 'Treemap' },
          { title: 'w1', type: 'OtherWidget' },
          { title: 'acl', type: 'AclService' },
        ],
      })
    );
    expect(item.collapsibleState).toBe(0);
    expect(item.tooltip).toBe('My PQ (Running) — no objects');
  });

  it('counts deephaven.ui panels as openable objects', () => {
    const item = getPersistentQueryTreeItem(
      makeNode({
        ...browsableUrls,
        status: 'Running',
        objects: [{ title: 'ui1', type: 'deephaven.ui.Element' }],
      })
    );
    expect(item.collapsibleState).toBe(1);
    expect(item.tooltip).toBe('My PQ (Running) — 1 object');
  });

  it('is non-expandable when the PQ exposes no objects (None = 0)', () => {
    const item = getPersistentQueryTreeItem(
      makeNode({ status: 'Running', objects: [] })
    );
    expect(item.collapsibleState).toBe(0);
    expect(item.tooltip).toBe('My PQ (Running) — no objects');
  });

  it('treats a PQ with no designated worker as non-expandable', () => {
    const item = getPersistentQueryTreeItem(makeNode(undefined));
    expect(item.collapsibleState).toBe(0);
    expect(item.tooltip).toBe('My PQ — no objects');
  });
});

describe('canBrowsePersistentQueryObjects', () => {
  const makeQueryInfo = (
    designated: unknown
  ): Parameters<typeof canBrowsePersistentQueryObjects>[0] =>
    ({ designated }) as unknown as Parameters<
      typeof canBrowsePersistentQueryObjects
    >[0];

  it('is true when the designated worker has both endpoints', () => {
    expect(
      canBrowsePersistentQueryObjects(
        makeQueryInfo({
          jsApiUrl: 'https://w/jsapi/dh-core.js',
          ideUrl: 'https://w/ide',
        })
      )
    ).toBe(true);
  });

  it.each([
    [undefined],
    [{ jsApiUrl: 'https://w/jsapi/dh-core.js', ideUrl: null }],
    [{ jsApiUrl: 'https://w/jsapi/dh-core.js', ideUrl: '' }],
    [{ jsApiUrl: null, ideUrl: 'https://w/ide' }],
    [{ jsApiUrl: '', ideUrl: 'https://w/ide' }],
  ])('is false without both endpoints: %s', designated => {
    expect(canBrowsePersistentQueryObjects(makeQueryInfo(designated))).toBe(
      false
    );
  });
});

describe('persistentQueryHasTables', () => {
  const makeQueryInfo = (
    objects: unknown
  ): Parameters<typeof persistentQueryHasTables>[0] =>
    ({ designated: { objects } }) as unknown as Parameters<
      typeof persistentQueryHasTables
    >[0];

  it('returns true when a table-typed object is present', () => {
    expect(
      persistentQueryHasTables(
        makeQueryInfo([
          { title: 'f1', type: 'Figure' },
          { title: 't1', type: 'TreeTable' },
        ])
      )
    ).toBe(true);
  });

  it('returns false when only non-table objects are present', () => {
    expect(
      persistentQueryHasTables(makeQueryInfo([{ title: 'f1', type: 'Figure' }]))
    ).toBe(false);
  });

  it('returns false when there are no objects', () => {
    expect(persistentQueryHasTables(makeQueryInfo([]))).toBe(false);
  });
});

describe('getPersistentQueryServerTreeItem', () => {
  it('renders an expanded server grouping node', () => {
    const server = {
      type: 'DHE',
      url: new URL('https://dhe.example.com/'),
      label: 'DHE',
    } as ServerState;
    const item = getPersistentQueryServerTreeItem(server);
    expect(item.label).toBe('DHE');
    expect(item.contextValue).toBe('isPersistentQueryServer');
    // Server icon, matching the Workers / Panels tree server nodes.
    expect((item.iconPath as vscode.ThemeIcon).id).toBe('vm-connect');
    // Expanded = 2 in the vscode mock enum.
    expect(item.collapsibleState).toBe(2);
  });
});

describe('getPersistentQueryObjectLeaves', () => {
  const workerUrl = new URL('https://dhe.example.com/worker/1/');

  it('maps designated.objects to [url, variable] leaves', () => {
    const queryInfo = {
      designated: {
        objects: [
          { title: 't', name: 't', type: 'Table', id: 'v1' },
          { title: 'f', name: 'f', type: 'Figure', id: 'v2' },
        ],
      },
    } as unknown as Parameters<typeof getPersistentQueryObjectLeaves>[1];

    const leaves = getPersistentQueryObjectLeaves(workerUrl, queryInfo);
    expect(leaves).toHaveLength(2);
    expect(leaves.map(([, v]) => v.title)).toEqual(['t', 'f']);
    leaves.forEach(([url]) => expect(url).toBe(workerUrl));
  });

  it('returns an empty array when there are no objects', () => {
    const queryInfo = {
      designated: { objects: [] },
    } as unknown as Parameters<typeof getPersistentQueryObjectLeaves>[1];
    expect(getPersistentQueryObjectLeaves(workerUrl, queryInfo)).toEqual([]);
  });

  it('filters out untitled / untyped objects defensively', () => {
    const queryInfo = {
      designated: {
        objects: [
          { title: 't', name: 't', type: 'Table', id: 'v1' },
          { title: null, name: 'x', type: 'Table', id: 'v2' },
          { title: 'y', name: 'y', type: null, id: 'v3' },
        ],
      },
    } as unknown as Parameters<typeof getPersistentQueryObjectLeaves>[1];
    const leaves = getPersistentQueryObjectLeaves(workerUrl, queryInfo);
    expect(leaves).toHaveLength(1);
  });
});
