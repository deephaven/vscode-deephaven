import { describe, it, expect, vi } from 'vitest';
import { isOpenablePanelVariable } from './panelUtils';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

describe('isOpenablePanelVariable', () => {
  it.each([
    // Grid plugin.
    ['Table'],
    ['TreeTable'],
    ['HierarchicalTable'],
    ['PartitionedTable'],
    // Chart / Pandas plugins.
    ['Figure'],
    ['pandas.DataFrame'],
    // First-party plugin widgets — deephaven.ui panels are openable.
    ['deephaven.ui.Element'],
    ['deephaven.plot.express.DeephavenFigure'],
  ])('is true for an openable type: %s', type => {
    expect(isOpenablePanelVariable({ title: 't', type })).toBe(true);
  });

  it.each([
    // A dashboard, not a panel.
    ['deephaven.ui.Dashboard'],
    // Legacy types no plugin claims.
    ['TableMap'],
    ['Treemap'],
    // The server's catch-all widget type.
    ['OtherWidget'],
    // DHE service objects exported by a worker.
    ['AclService'],
    // An unknown server plugin type — hidden until added to the allow-list.
    ['some.server.PluginWidget'],
  ])('is false for a type that is not an openable panel: %s', type => {
    expect(isOpenablePanelVariable({ title: 't', type })).toBe(false);
  });

  it.each([
    [{ title: '', type: 'Table' }],
    [{ title: null, type: 'Table' }],
    [{ type: 'Table' }],
    [{ title: 't', type: '' }],
    [{ title: 't', type: null }],
    [{ title: 't' }],
    [{}],
  ])('is false without both a title and an openable type: %s', variable => {
    expect(isOpenablePanelVariable(variable)).toBe(false);
  });
});
