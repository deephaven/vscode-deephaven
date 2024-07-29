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
  const urlA = 'http://someUrl';
  const urlB = 'http://someOtherUrl';
  const urlC = 'http://someAdditionalUrl';
  const urlInvalid = 'invalidUrl';

  it.each([
    ['Empty config', [], []],
    [
      'String config',
      [urlA, urlB, urlInvalid],
      [
        { url: urlA, consoleType: 'python' },
        { url: urlB, consoleType: 'python' },
      ],
    ],
    [
      'Default url',
      [{ url: urlA }, { url: urlB }, { url: urlInvalid }],
      [
        { url: urlA, consoleType: 'python' },
        { url: urlB, consoleType: 'python' },
      ],
    ],
    [
      'Full config',
      [
        { url: urlA, consoleType: 'python' },
        { url: urlB, consoleType: 'python' },
        { url: urlInvalid, consoleType: 'python' },
        { url: urlC, consoleType: 'invalid' },
      ],
      [
        { url: urlA, consoleType: 'python' },
        { url: urlB, consoleType: 'python' },
      ],
    ],
  ])('should return core servers: %s', (_label, given, expected) => {
    configMap.set(CONFIG_CORE_SERVERS, given);

    const config = Config.getCoreServers();

    expect(config).toEqual(expected);
  });
});
