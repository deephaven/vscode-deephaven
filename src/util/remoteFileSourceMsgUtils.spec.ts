import { describe, it, expect } from 'vitest';
import {
  moduleSpecResponse,
  moduleSpecErrorResponse,
  setConnectionIdRequest,
} from './remoteFileSourceMsgUtils';
import type { ModuleFullname, UniqueID } from '../types';

const mockMsgId = 'mock.msgId';
const mockModuleName = 'mock.module' as ModuleFullname;

describe('moduleSpecResponse', () => {
  it('should return correct JSON-RPC success response', () => {
    const result = moduleSpecResponse(
      mockMsgId,
      {
        name: mockModuleName,
        isPackage: true,
        origin: '/path/to/foo',
        subModuleSearchLocations: ['foo/bar', 'foo/baz'],
      },
      'print("hello")'
    );
    expect(result).toMatchSnapshot();
  });
});

describe('moduleSpecErrorResponse', () => {
  it('should return correct JSON-RPC error response', () => {
    const result = moduleSpecErrorResponse(mockMsgId, mockModuleName);
    expect(result).toMatchSnapshot();
  });
});

describe('setConnectionIdRequest', () => {
  const mockCnId = 'mock.cnId' as UniqueID;

  it('should return correct JSON-RPC set connection ID request', () => {
    const result = setConnectionIdRequest(mockCnId);
    expect(result.id).toBe(mockCnId);
    expect(result).toMatchSnapshot();
  });
});
