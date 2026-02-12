import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MCP_DOCS_SERVER_NAME,
  MCP_DOCS_SERVER_URL,
  MCP_SERVER_NAME,
} from '../common';
import {
  deleteConfigKeys,
  updateWindsurfDocsMcpServerConfig,
  updateWindsurfMcpServerConfig,
} from './configUtils';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('updateWindsurfMcpServerConfig', () => {
  const mockUrl = 'http://localhost:4000/mcp';
  const oldUrl = 'http://localhost:3000/mcp';

  it.each([
    {
      description: 'should return same object if URL already correct',
      config: {
        [MCP_SERVER_NAME]: { serverUrl: mockUrl },
        otherServer: { serverUrl: 'http://other.com' },
      },
      expected: {
        [MCP_SERVER_NAME]: { serverUrl: mockUrl },
        otherServer: { serverUrl: 'http://other.com' },
      },
      sameReference: true,
    },
    {
      description: 'should add server entry if config is undefined',
      config: undefined,
      expected: {
        [MCP_SERVER_NAME]: { serverUrl: mockUrl },
      },
      sameReference: false,
    },
    {
      description: 'should add server entry if not present',
      config: {
        otherServer: { serverUrl: 'http://other.com' },
      },
      expected: {
        otherServer: { serverUrl: 'http://other.com' },
        [MCP_SERVER_NAME]: { serverUrl: mockUrl },
      },
      sameReference: false,
    },
    {
      description: 'should update server entry if URL is different',
      config: {
        [MCP_SERVER_NAME]: { serverUrl: oldUrl },
        otherServer: { serverUrl: 'http://other.com' },
      },
      expected: {
        [MCP_SERVER_NAME]: { serverUrl: mockUrl },
        otherServer: { serverUrl: 'http://other.com' },
      },
      sameReference: false,
    },
    {
      description: 'should preserve other properties in config',
      config: {
        server1: { serverUrl: 'http://server1.com' },
        server2: { serverUrl: 'http://server2.com' },
      },
      expected: {
        server1: { serverUrl: 'http://server1.com' },
        server2: { serverUrl: 'http://server2.com' },
        [MCP_SERVER_NAME]: { serverUrl: mockUrl },
      },
      sameReference: false,
    },
  ])('$description', ({ config, expected, sameReference }) => {
    const result = updateWindsurfMcpServerConfig(
      config as typeof config & Record<string, { serverUrl?: string }>,
      mockUrl
    );

    expect(result).toEqual(expected);
    if (sameReference) {
      expect(result).toBe(config);
    } else if (config !== undefined) {
      expect(result).not.toBe(config);
    }
  });
});

describe('updateWindsurfDocsMcpServerConfig', () => {
  it.each([
    {
      description:
        'should return same object if docs URL already exists by name',
      config: {
        [MCP_DOCS_SERVER_NAME]: { serverUrl: MCP_DOCS_SERVER_URL },
        otherServer: { serverUrl: 'http://other.com' },
      },
      expected: {
        [MCP_DOCS_SERVER_NAME]: { serverUrl: MCP_DOCS_SERVER_URL },
        otherServer: { serverUrl: 'http://other.com' },
      },
      sameReference: true,
    },
    {
      description:
        'should return same object if docs URL exists under different name',
      config: {
        customName: { serverUrl: MCP_DOCS_SERVER_URL },
        otherServer: { serverUrl: 'http://other.com' },
      },
      expected: {
        customName: { serverUrl: MCP_DOCS_SERVER_URL },
        otherServer: { serverUrl: 'http://other.com' },
      },
      sameReference: true,
    },
    {
      description: 'should add docs entry if config is undefined',
      config: undefined,
      expected: {
        [MCP_DOCS_SERVER_NAME]: { serverUrl: MCP_DOCS_SERVER_URL },
      },
      sameReference: false,
    },
    {
      description: 'should add docs entry if not present',
      config: {
        otherServer: { serverUrl: 'http://other.com' },
      },
      expected: {
        otherServer: { serverUrl: 'http://other.com' },
        [MCP_DOCS_SERVER_NAME]: { serverUrl: MCP_DOCS_SERVER_URL },
      },
      sameReference: false,
    },
    {
      description: 'should add docs entry if docs URL not found',
      config: {
        [MCP_DOCS_SERVER_NAME]: { serverUrl: 'http://different-url.com' },
        otherServer: { serverUrl: 'http://other.com' },
      },
      expected: {
        [MCP_DOCS_SERVER_NAME]: { serverUrl: MCP_DOCS_SERVER_URL },
        otherServer: { serverUrl: 'http://other.com' },
      },
      sameReference: false,
    },
  ])('$description', ({ config, expected, sameReference }) => {
    const result = updateWindsurfDocsMcpServerConfig(
      config as typeof config & Record<string, { serverUrl?: string }>
    );

    expect(result).toEqual(expected);
    if (sameReference) {
      expect(result).toBe(config);
    } else if (config !== undefined) {
      expect(result).not.toBe(config);
    }
  });
});

describe('deleteConfigKeys', () => {
  it.each([
    {
      description: 'should return same object if config is undefined',
      config: undefined,
      keys: ['key1', 'key2'],
      expected: undefined,
      sameReference: true,
    },
    {
      description: 'should return same object if keys array is empty',
      config: { key1: 'value1', key2: 'value2' },
      keys: [],
      expected: { key1: 'value1', key2: 'value2' },
      sameReference: true,
    },
    {
      description: 'should return same object if no keys to delete exist',
      config: { key1: 'value1', key2: 'value2' },
      keys: ['key3', 'key4'],
      expected: { key1: 'value1', key2: 'value2' },
      sameReference: true,
    },
    {
      description: 'should delete single key',
      config: { key1: 'value1', key2: 'value2', key3: 'value3' },
      keys: ['key2'],
      expected: { key1: 'value1', key3: 'value3' },
      sameReference: false,
    },
    {
      description: 'should delete multiple keys',
      config: {
        key1: 'value1',
        key2: 'value2',
        key3: 'value3',
        key4: 'value4',
      },
      keys: ['key2', 'key4'],
      expected: { key1: 'value1', key3: 'value3' },
      sameReference: false,
    },
    {
      description:
        'should delete all specified keys, ignoring non-existent ones',
      config: { key1: 'value1', key2: 'value2' },
      keys: ['key1', 'key3', 'key4'],
      expected: { key2: 'value2' },
      sameReference: false,
    },
    {
      description: 'should handle deleting all keys',
      config: { key1: 'value1', key2: 'value2' },
      keys: ['key1', 'key2'],
      expected: {},
      sameReference: false,
    },
  ])('$description', ({ config, keys, expected, sameReference }) => {
    const result = deleteConfigKeys(config, keys);

    expect(result).toEqual(expected);
    if (sameReference) {
      expect(result).toBe(config);
    } else if (config !== undefined) {
      expect(result).not.toBe(config);
    }
  });

  it('should preserve values of undeleted keys', () => {
    const complexValue = { nested: { deep: 'value' } };
    const config = {
      key1: complexValue,
      key2: 'value2',
      key3: [1, 2, 3],
    };

    const result = deleteConfigKeys(config, ['key2']);

    expect(result).toEqual({
      key1: complexValue,
      key3: [1, 2, 3],
    });
    expect(result?.key1).toBe(complexValue);
  });
});
