import { beforeEach, describe, it, expect, vi, afterAll } from 'vitest';
import { pollUntilTrue } from './PollingService';

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

describe('pollUntilTrue', () => {
  const poll = vi.fn<() => Promise<boolean>>().mockName('poll');

  it('should resolve when poll function returns true', async () => {
    const intervalMs = 100;
    poll.mockResolvedValue(false);

    const { promise } = pollUntilTrue(poll, intervalMs);
    promise.then(resolved);

    // Initial polling call that is scheduled via setTimeout(..., 0)
    await vi.advanceTimersToNextTimerAsync();
    expect(poll).toHaveBeenCalledTimes(1);
    expect(resolved).not.toHaveBeenCalled();

    // 2nd poll (after first intervalMs)
    await vi.advanceTimersByTimeAsync(intervalMs);
    expect(poll).toHaveBeenCalledTimes(2);
    expect(resolved).not.toHaveBeenCalled();

    poll.mockResolvedValue(true);

    // 3rd poll
    await vi.advanceTimersByTimeAsync(intervalMs);
    expect(poll).toHaveBeenCalledTimes(3);
    expect(resolved).toHaveBeenCalledWith(true);

    // Advance intervalMs. No more polling expected since resolved
    await vi.advanceTimersByTimeAsync(intervalMs);
    expect(poll).toHaveBeenCalledTimes(3);
    expect(resolved).toHaveBeenCalledOnce();
  });

  it('should cancel polling if timeout exceeded', async () => {
    const intervalMs = 100;
    const timeoutMs = 1000;

    poll.mockResolvedValue(false);

    const { promise } = pollUntilTrue(poll, intervalMs, timeoutMs);
    promise.then(resolved).catch(rejected);

    expect(resolved).not.toHaveBeenCalled();
    expect(rejected).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(timeoutMs);

    expect(resolved).not.toHaveBeenCalled();
    expect(rejected).toHaveBeenCalledWith(new Error('Polling cancelled'));
  });

  it('should cancel polling if cancel explicitly called', async () => {
    const intervalMs = 100;

    poll.mockResolvedValue(false);

    const { promise, cancel } = pollUntilTrue(poll, intervalMs);
    promise.then(resolved).catch(rejected);

    expect(resolved).not.toHaveBeenCalled();
    expect(rejected).not.toHaveBeenCalled();

    cancel();

    await vi.advanceTimersToNextTimerAsync();

    expect(resolved).not.toHaveBeenCalled();
    expect(rejected).toHaveBeenCalledWith(new Error('Polling cancelled'));
  });
});
