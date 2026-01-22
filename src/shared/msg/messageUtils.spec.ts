import { describe, expect, it } from 'vitest';
import {
  isCreateQueryMsgFromDh,
  isCreateQueryMsgFromVscode,
  isLoginOptionsRequestFromDh,
  isLoginOptionsResponseFromVscode,
  isSessionDetailsRequestFromDh,
  isSessionDetailsResponseFromVscode,
  isWindowProxy,
} from './messageUtils';
import {
  DH_POST_MSG,
  type DhCreateQueryMsg,
  type DhVariablePanelMsg,
} from './dhPostMsg';
import {
  VSCODE_POST_MSG,
  type VscodeCreateQueryMsg,
  type VscodeVariablePanelMsg,
} from './vscodePostMsg';

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
  const mockWindowProxy = {
    window: {},
  } as WindowProxy;

  const mockNotWindowProxy = {} as MessageEventSource;

  it.each([
    [mockWindowProxy, true],
    [mockNotWindowProxy, false],
  ])(
    'should return true if source is a WindowProxy: %s',
    (source, expected) => {
      expect(isWindowProxy(source)).toBe(expected);
    }
  );
});

describe('isLoginOptionsRequestFromDh', () => {
  it('should return true for login options request message', () => {
    const msg = {
      message: DH_POST_MSG.loginOptionsRequest,
    } as DhVariablePanelMsg | VscodeVariablePanelMsg;

    expect(isLoginOptionsRequestFromDh(msg)).toBe(true);
  });

  it.each(
    Object.values(DH_POST_MSG).filter(
      m => m !== DH_POST_MSG.loginOptionsRequest
    )
  )('should return false for other DH messages: %s', message => {
    const msg = {
      message,
    } as DhVariablePanelMsg | VscodeVariablePanelMsg;

    expect(isLoginOptionsRequestFromDh(msg)).toBe(false);
  });

  it.each(Object.values(VSCODE_POST_MSG))(
    'should return false for vscode messages: %s',
    message => {
      const msg = {
        message,
      } as DhVariablePanelMsg | VscodeVariablePanelMsg;

      expect(isLoginOptionsRequestFromDh(msg)).toBe(false);
    }
  );
});

describe('isSessionDetailsRequestFromDh', () => {
  it('should return true for session details request message', () => {
    const msg = {
      message: DH_POST_MSG.sessionDetailsRequest,
    } as DhVariablePanelMsg | VscodeVariablePanelMsg;

    expect(isSessionDetailsRequestFromDh(msg)).toBe(true);
  });

  it.each(
    Object.values(DH_POST_MSG).filter(
      m => m !== DH_POST_MSG.sessionDetailsRequest
    )
  )('should return false for other DH messages: %s', message => {
    const msg = {
      message,
    } as DhVariablePanelMsg | VscodeVariablePanelMsg;

    expect(isSessionDetailsRequestFromDh(msg)).toBe(false);
  });

  it.each(Object.values(VSCODE_POST_MSG))(
    'should return false for vscode messages: %s',
    message => {
      const msg = {
        message,
      } as DhVariablePanelMsg | VscodeVariablePanelMsg;

      expect(isSessionDetailsRequestFromDh(msg)).toBe(false);
    }
  );
});

describe('isLoginOptionsResponseFromVscode', () => {
  it('should return true for login options response message', () => {
    const msg = {
      message: VSCODE_POST_MSG.loginOptionsResponse,
    } as DhVariablePanelMsg | VscodeVariablePanelMsg;

    expect(isLoginOptionsResponseFromVscode(msg)).toBe(true);
  });

  it.each(
    Object.values(VSCODE_POST_MSG).filter(
      m => m !== VSCODE_POST_MSG.loginOptionsResponse
    )
  )('should return false for other vscode messages: %s', message => {
    const msg = {
      message,
    } as DhVariablePanelMsg | VscodeVariablePanelMsg;

    expect(isLoginOptionsResponseFromVscode(msg)).toBe(false);
  });

  it.each(Object.values(DH_POST_MSG))(
    'should return false for DH messages: %s',
    message => {
      const msg = {
        message,
      } as DhVariablePanelMsg | VscodeVariablePanelMsg;

      expect(isLoginOptionsResponseFromVscode(msg)).toBe(false);
    }
  );
});

describe('isSessionDetailsResponseFromVscode', () => {
  it('should return true for session details response message', () => {
    const msg = {
      message: VSCODE_POST_MSG.sessionDetailsResponse,
    } as DhVariablePanelMsg | VscodeVariablePanelMsg;

    expect(isSessionDetailsResponseFromVscode(msg)).toBe(true);
  });

  it.each(
    Object.values(VSCODE_POST_MSG).filter(
      m => m !== VSCODE_POST_MSG.sessionDetailsResponse
    )
  )('should return false for other vscode messages: %s', message => {
    const msg = {
      message,
    } as DhVariablePanelMsg | VscodeVariablePanelMsg;

    expect(isSessionDetailsResponseFromVscode(msg)).toBe(false);
  });

  it.each(Object.values(DH_POST_MSG))(
    'should return false for DH messages: %s',
    message => {
      const msg = {
        message,
      } as DhVariablePanelMsg | VscodeVariablePanelMsg;

      expect(isSessionDetailsResponseFromVscode(msg)).toBe(false);
    }
  );
});
