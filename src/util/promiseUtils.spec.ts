import { beforeEach, describe, it, expect, vi, afterAll } from 'vitest';
import { rejectAfterTimeout, waitFor, withResolvers } from './promiseUtils';

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
