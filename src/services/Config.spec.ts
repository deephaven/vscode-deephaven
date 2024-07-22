import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { Config } from './Config';
import { CONFIG_CORE_SERVERS } from '../common';

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn().mockReturnValue(new Map()),
  },
}));

let configMap: Map<string, unknown>;

beforeEach(() => {
  configMap = new Map();

  vi.clearAllMocks();
  (
    vscode.workspace.getConfiguration as Mock<
      typeof vscode.workspace.getConfiguration
    >
  ).mockReturnValue(configMap as unknown as vscode.WorkspaceConfiguration);
});

describe('Config', () => {
  it.each([
    ['Empty config', [], []],
    [
      'String config',
      ['someUrl', 'someOtherUrl'],
      [
        { url: 'someUrl', consoleType: 'python' },
        { url: 'someOtherUrl', consoleType: 'python' },
      ],
    ],
    [
      'Default url',
      [{ url: 'someUrl' }, { url: 'someOtherUrl' }],
      [
        { url: 'someUrl', consoleType: 'python' },
        { url: 'someOtherUrl', consoleType: 'python' },
      ],
    ],
    [
      'Full config',
      [
        { url: 'someUrl', consoleType: 'python' },
        { url: 'someOtherUrl', consoleType: 'python' },
      ],
      [
        { url: 'someUrl', consoleType: 'python' },
        { url: 'someOtherUrl', consoleType: 'python' },
      ],
    ],
  ])('should return core servers: %s', (_label, given, expected) => {
    configMap.set(CONFIG_CORE_SERVERS, given);

    const config = Config.getCoreServers();

    expect(config).toEqual(expected);
  });
});
