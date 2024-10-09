import { describe, it, expect, vi } from 'vitest';
import { bitValues, boolValues, matrix } from './testUtils';
import {
  getPanelConnectionTreeItem,
  getPanelVariableTreeItem,
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
  IDhService,
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
  const getConsoleTypes: IDhService['getConsoleTypes'] = vi
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
      } as IDhService;

      vi.mocked(isInstanceOf).mockReturnValue(true);

      const actual = await getPanelConnectionTreeItem(connection);
      expect(actual).toMatchSnapshot();
    }
  );
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
  it.each(matrix(boolValues, boolValues, boolValues))(
    'should return contextValue based on server state: isConnected=%s, isManaged=%s, isRunning=%s',
    (isConnected, isManaged, isRunning) => {
      const actual = getServerContextValue({
        isConnected,
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
  it.each(matrix(boolValues, boolValues, boolValues))(
    'should return icon id based on server state: isConnected=%s, isManaged=%s, isRunning=%s',
    (isConnected, isManaged, isRunning) => {
      const actual = getServerIconID({ isConnected, isManaged, isRunning });
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

  it.each(matrix(typeValues, boolValues, boolValues, boolValues))(
    'should return server tree item: type=%s, isConnected=%s, isManaged=%s, isRunning=%s',
    (type, isConnected, isManaged, isRunning) => {
      const actual = getServerTreeItem({
        ...dhcServerState,
        ...(isManaged
          ? { isManaged: true, psk: 'mock.psk' }
          : { isManaged: false }),
        type,
        connectionCount: isConnected ? 1 : 0,
        isConnected,
        isRunning,
      });

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
