import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  createThrottledTrigger,
  rejectAfterTimeout,
  waitFor,
  waitForEvent,
  withResolvers,
} from './promiseUtils';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterAll(() => {
  vi.useRealTimers();
});

const resolved = vi.fn().mockName('resolved');
const rejected = vi.fn().mockName('rejected');

describe('rejectAfterTimeout', () => {
  it('should return a Promise that rejects after a given timeout', async () => {
    const promise = rejectAfterTimeout(100, 'Cancelled by timeout.');

    promise.catch(rejected);

    await vi.advanceTimersByTimeAsync(99);
    expect(rejected).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(rejected).toHaveBeenCalledWith('Cancelled by timeout.');
  });

  it('should clear the timeout when the subscriptions are disposed', async () => {
    const disposables: { dispose: () => void }[] = [];
    const promise = rejectAfterTimeout(
      100,
      'Cancelled by timeout.',
      disposables
    );

    promise.catch(rejected);

    disposables[0].dispose();
    await vi.advanceTimersByTimeAsync(100);
    expect(rejected).not.toHaveBeenCalled();
  });
});

describe('waitFor', () => {
  it('should return a Promise that resolves after a given timeout', async () => {
    waitFor(100).then(resolved);

    await vi.advanceTimersByTimeAsync(99);
    expect(resolved).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toHaveBeenCalled();
  });
});

describe('waitForEvent', () => {
  it('should return a Promise that resolves when event fires', async () => {
    const target = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    const promise = waitForEvent(target, 'testEvent');
    promise.then(resolved);

    expect(target.addEventListener).toHaveBeenCalledWith(
      'testEvent',
      expect.any(Function)
    );

    // Get the handler that was registered
    const handler = target.addEventListener.mock.calls[0][1];

    // Fire the event by calling the handler
    handler();

    await vi.advanceTimersToNextTimerAsync();
    expect(resolved).toHaveBeenCalled();
    expect(target.removeEventListener).toHaveBeenCalledWith(
      'testEvent',
      handler
    );
  });
});

describe('withResolvers', () => {
  it('should return a promise that resolves when resolve function is called', async () => {
    const { promise, resolve } = withResolvers<string>();

    promise.then(resolved);

    await vi.advanceTimersToNextTimerAsync();
    expect(resolved).not.toHaveBeenCalled();

    resolve('value');

    await vi.advanceTimersToNextTimerAsync();
    expect(resolved).toHaveBeenCalledWith('value');
  });

  it('should return a promise that rejects when reject function is called', async () => {
    const { promise, reject } = withResolvers<string>();

    promise.catch(rejected);

    await vi.advanceTimersToNextTimerAsync();
    expect(rejected).not.toHaveBeenCalled();

    reject('Some Error');

    await vi.advanceTimersToNextTimerAsync();
    expect(rejected).toHaveBeenCalledWith('Some Error');
  });
});

describe('createThrottledTrigger', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs immediately on the leading edge', () => {
    const callback = vi.fn();
    const throttled = createThrottledTrigger(callback, 250);

    throttled.trigger();

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('coalesces a burst into one trailing run', () => {
    const callback = vi.fn();
    const throttled = createThrottledTrigger(callback, 250);

    throttled.trigger();
    throttled.trigger();
    throttled.trigger();
    throttled.trigger();
    expect(callback).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(250);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('does not run again when nothing arrived during the window', () => {
    const callback = vi.fn();
    const throttled = createThrottledTrigger(callback, 250);

    throttled.trigger();
    vi.advanceTimersByTime(1000);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('keeps running under a source that never goes quiet', () => {
    // The reason this is a throttle and not a debounce: a debounce timer would
    // be reset forever here and the callback would never run at all.
    const callback = vi.fn();
    const throttled = createThrottledTrigger(callback, 250);

    for (let i = 0; i < 100; ++i) {
      throttled.trigger();
      vi.advanceTimersByTime(100);
    }

    // ~10,000ms of ticks every 100ms, rate limited to one run per 250ms.
    expect(callback.mock.calls.length).toBeGreaterThan(30);
    expect(callback.mock.calls.length).toBeLessThan(45);
  });

  it('drops a pending trailing run when disposed', () => {
    const callback = vi.fn();
    const throttled = createThrottledTrigger(callback, 250);

    throttled.trigger();
    throttled.trigger();
    throttled.dispose();

    vi.advanceTimersByTime(1000);

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
