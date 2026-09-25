import { describe, it, expect, vi } from 'vitest';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { isOpenablePanelVariable } from './panelUtils';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

describe('isOpenablePanelVariable', () => {
  it.each<[string, Partial<DhcType.ide.VariableDefinition>, boolean]>([
    [
      'is true for a variable with an id and a title',
      { id: 'v1', title: 't1' },
      true,
    ],
    // Type is the server's business — which types render is up to the plugins
    // installed on it, so an unrecognized one must not be filtered out.
    [
      'is true for a type no bundled plugin claims',
      { id: 'v1', title: 't1', type: 'some.server.PluginWidget' },
      true,
    ],
    // The embed widget url addresses the object by title, so an empty one could
    // only open an empty panel.
    ['is false for an empty title', { id: 'v1', title: '' }, false],
    // Open panels are keyed by id; empty ids would all collide.
    // PQ exported objects have no id; panel keys fall back to title.
    ['is true without an id', { title: 't1' }, true],
    ['is true for an empty id', { id: '', title: 't1' }, true],
    ['is false for a missing title', { id: 'v1' }, false],
  ])('%s', (_label, variable, expected) => {
    expect(
      isOpenablePanelVariable(variable as DhcType.ide.VariableDefinition)
    ).toBe(expected);
  });
});
