import { describe, it, expect, vi } from 'vitest';
import { bitValues, boolValues, matrix } from '../testUtils';
import {
  getConnectionServerTreeItem,
  getPanelConnectionTreeItem,
  getPanelVariableTreeItem,
  getPersistentQueryIconId,
  getPersistentQueryObjectLeaves,
  getPersistentQueryServerTreeItem,
  getPersistentQueryTreeItem,
  isPersistentQueryNode,
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
  Psk,
  ServerState,
  VariableDefintion,
  VariableType,
} from '../types';
import { isInstanceOf } from './isInstanceOf';

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

describe('getPanelVariableTreeItem', () => {
  const url = new URL('http://localhost:10000');

  it.each(variableTypes)(
    'should return panel variable tree item: type:%s',
    type => {
      const variable = {
        title: 'some title',
        type,
      } as VariableDefintion;

      const actual = getPanelVariableTreeItem([url, variable]);
      expect(actual).toMatchSnapshot();
    }
  );
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

describe('getPersistentQueryIconId', () => {
  it('returns the connected icon for a Running PQ', () => {
    expect(getPersistentQueryIconId('Running')).toBe('circle-large-filled');
  });

  it.each([['Stopped'], ['Initializing'], [null], [undefined]])(
    'returns the connecting/spinner icon for non-Running status: %s',
    status => {
      expect(getPersistentQueryIconId(status as string | null)).toBe(
        'sync~spin'
      );
    }
  );
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
  it('renders name + owner + collapsed state + context value', () => {
    const node = {
      dheServerUrl: new URL('https://dhe.example.com/'),
      queryInfo: {
        name: 'My PQ',
        owner: 'alice',
        designated: { status: 'Running' },
      },
    } as unknown as Parameters<typeof getPersistentQueryTreeItem>[0];

    const item = getPersistentQueryTreeItem(node);
    expect(item.label).toBe('My PQ');
    expect(item.description).toBe('alice');
    expect(item.contextValue).toBe('isPersistentQuery');
    // Collapsed = 1 in the vscode mock enum.
    expect(item.collapsibleState).toBe(1);
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
