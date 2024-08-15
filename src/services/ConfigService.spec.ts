import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { ConfigService } from './ConfigService';
import { CONFIG_KEY } from '../common';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

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

const urlA = 'http://someUrl';
const urlB = 'http://someOtherUrl';
const urlC = 'http://someAdditionalUrl';
const urlInvalid = 'invalidUrl';

describe('getCoreServers', () => {
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
      'Default consoleType',
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
    configMap.set(CONFIG_KEY.coreServers, given);

    const config = ConfigService.getCoreServers();

    expect(config).toEqual(expected);
  });
});

describe('getEnterpriseServers', () => {
  it.each([
    ['Empty config', [], []],
    ['String config', [urlA, urlB, urlInvalid], [{ url: urlA }, { url: urlB }]],
  ])('should return enterprise servers: %s', (_label, given, expected) => {
    configMap.set(CONFIG_KEY.enterpriseServers, given);

    const config = ConfigService.getEnterpriseServers();

    expect(config).toEqual(expected);
  });
});
