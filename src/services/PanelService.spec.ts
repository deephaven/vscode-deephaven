import type * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PanelService } from './PanelService';
import type { PanelVariable } from '../types';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

const workerUrl = new URL('https://dhe.example.com/worker/1/');

function makeVariable(title: string, id?: string): PanelVariable {
  return { id, title, name: title, type: 'Table' } as PanelVariable;
}

function makePanel(): vscode.WebviewPanel {
  return {} as vscode.WebviewPanel;
}

describe('PanelService panel keys', () => {
  let panelService: PanelService;

  beforeEach(() => {
    panelService = new PanelService();
  });

  it('keys by id when present', () => {
    const panel = makePanel();
    panelService.setPanel(workerUrl, makeVariable('t', 'v1'), panel);

    expect(
      panelService.getPanelOrThrow(workerUrl, makeVariable('t', 'v1'))
    ).toBe(panel);
    // Same title, different id is a different panel.
    expect(panelService.hasPanel(workerUrl, makeVariable('t', 'v2'))).toBe(
      false
    );
  });

  // PQ exported objects have no id. Without a fallback they would all share
  // one panel, whose content would update while its title stayed the first.
  it.each([
    ['a missing id', undefined],
    ['an empty id', ''],
  ])('keys by title for %s', (_label, id) => {
    const panelA = makePanel();
    const panelB = makePanel();
    panelService.setPanel(workerUrl, makeVariable('a', id), panelA);
    panelService.setPanel(workerUrl, makeVariable('b', id), panelB);

    expect(panelService.getPanelOrThrow(workerUrl, makeVariable('a', id))).toBe(
      panelA
    );
    expect(panelService.getPanelOrThrow(workerUrl, makeVariable('b', id))).toBe(
      panelB
    );
    expect(panelService.hasPanel(workerUrl, makeVariable('c', id))).toBe(false);
  });

  it('deletes by the same key', () => {
    const variable = makeVariable('a');
    panelService.setPanel(workerUrl, variable, makePanel());

    panelService.deletePanel(workerUrl, variable);

    expect(panelService.hasPanel(workerUrl, variable)).toBe(false);
    expect(() => panelService.getPanelOrThrow(workerUrl, variable)).toThrow();
  });

  it('scopes keys per connection url', () => {
    const otherWorkerUrl = new URL('https://dhe.example.com/worker/2/');
    panelService.setPanel(workerUrl, makeVariable('a'), makePanel());

    expect(panelService.hasPanel(otherWorkerUrl, makeVariable('a'))).toBe(
      false
    );
  });

  // PQ connections have no DhcService calling updateVariables, so panel
  // variables must come from the panels themselves (e.g. for theme reloads).
  it('returns panel variables without tracked variables', () => {
    const variableA = makeVariable('a');
    const variableB = makeVariable('b');
    panelService.setPanel(workerUrl, variableA, makePanel());
    panelService.setPanel(workerUrl, variableB, makePanel());
    panelService.deletePanel(workerUrl, variableB);

    expect(panelService.getPanelVariables(workerUrl)).toEqual([variableA]);
  });
});
