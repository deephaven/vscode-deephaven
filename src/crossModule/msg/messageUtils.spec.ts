import { describe, expect, it } from 'vitest';
import {
  isCreateQueryMsgFromDh,
  isCreateQueryMsgFromVscode,
  isWindowProxy,
} from './messageUtils';
import { DH_POST_MSG, type DhCreateQueryMsg } from './dhPostMsg';
import { VSCODE_POST_MSG, type VscodeCreateQueryMsg } from './vscodePostMsg';

describe('isCreateQueryMsgFromDh', () => {
  it.each(Object.values(DH_POST_MSG))(
    'should return true if is create query msg from dh: %s',
    message => {
      const msg = {
        message,
      } as DhCreateQueryMsg | VscodeCreateQueryMsg;

      expect(isCreateQueryMsgFromDh(msg)).toBe(true);
    }
  );

  it.each(Object.values(VSCODE_POST_MSG))(
    'should return false if is create query msg from vscode: %s',
    message => {
      const msg = {
        message,
      } as DhCreateQueryMsg | VscodeCreateQueryMsg;

      expect(isCreateQueryMsgFromDh(msg)).toBe(false);
    }
  );
});

describe('isCreateQueryMsgFromVscode', () => {
  it.each(Object.values(VSCODE_POST_MSG))(
    'should return true if is create query msg from vscode: %s',
    message => {
      const msg = {
        message,
      } as DhCreateQueryMsg | VscodeCreateQueryMsg;

      expect(isCreateQueryMsgFromVscode(msg)).toBe(true);
    }
  );

  it.each(Object.values(DH_POST_MSG))(
    'should return false if is create query msg from dh: %s',
    message => {
      const msg = {
        message,
      } as DhCreateQueryMsg | VscodeCreateQueryMsg;

      expect(isCreateQueryMsgFromVscode(msg)).toBe(false);
    }
  );
});

describe('isWindowProxy', () => {
  it('should return true if source is a WindowProxy', () => {
    const source = {
      window: {},
    } as MessageEventSource;

    expect(isWindowProxy(source)).toBe(true);
  });

  it('should return false if source is not a WindowProxy', () => {
    const source = {} as MessageEventSource;

    expect(isWindowProxy(source)).toBe(false);
  });
});
