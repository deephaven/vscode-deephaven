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
const urlInvalid = 'invalidUrl';

describe('getCoreServers', () => {
  it.each([
    ['Empty config', [], []],
    [
      'String config',
      [urlA, urlB, urlInvalid],
      [{ url: new URL(urlA) }, { url: new URL(urlB) }],
    ],
    [
      'No label',
      [{ url: urlA }, { url: urlB }, { url: urlInvalid }],
      [{ url: new URL(urlA) }, { url: new URL(urlB) }],
    ],
    [
      'Full config',
      [
        { url: urlA, label: 'python' },
        { url: urlB, label: 'python' },
        { url: urlInvalid, label: 'python' },
      ],
      [
        { url: new URL(urlA), label: 'python' },
        { url: new URL(urlB), label: 'python' },
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
    [
      'String config',
      [urlA, urlB, urlInvalid],
      [{ url: new URL(urlA) }, { url: new URL(urlB) }],
    ],
  ])('should return enterprise servers: %s', (_label, given, expected) => {
    configMap.set(CONFIG_KEY.enterpriseServers, given);

    const config = ConfigService.getEnterpriseServers();

    expect(config).toEqual(expected);
  });
});
