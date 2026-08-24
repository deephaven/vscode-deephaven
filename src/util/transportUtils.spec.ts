import { describe, it, expect, vi } from 'vitest';
import { NodeHttp2gRPCTransport } from '@deephaven/jsapi-nodejs';
import { getSharedTransportFactory } from './transportUtils';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

vi.mock('@deephaven/jsapi-nodejs', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  NodeHttp2gRPCTransport: {
    createFactory: vi.fn(() => ({ create: vi.fn() })),
  },
}));

vi.mock('./connectDiagnostics', () => ({
  isConnectTimingEnabled: vi.fn(() => false),
}));

const createFactoryMock = vi.mocked(NodeHttp2gRPCTransport.createFactory);

// The factory is memoized at module scope, so these assertions are deliberately
// made against a single shared creation rather than reset between tests.
describe('getSharedTransportFactory', () => {
  it('should create the factory exactly once and reuse it', () => {
    const first = getSharedTransportFactory();
    const second = getSharedTransportFactory();
    const third = getSharedTransportFactory();

    // Each `createFactory` call allocates its own session map, so calling it per
    // site would open a TCP connection per origin *per site* rather than sharing
    // them, which is what the deprecated static `factory` did for free.
    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(createFactoryMock).toHaveBeenCalledTimes(1);
  });

  it('should configure both HTTP/2 window sizes', () => {
    getSharedTransportFactory();

    expect(createFactoryMock.mock.calls[0]?.[0]).toMatchObject({
      initialWindowSize: 4 * 1024 * 1024,
      sessionWindowSize: 8 * 1024 * 1024,
    });
  });

  it('should omit metrics callbacks when diagnostics are disabled', () => {
    getSharedTransportFactory();

    // Upstream skips all metrics accounting when the callbacks are absent, so
    // they must not be passed unconditionally.
    const config = createFactoryMock.mock.calls[0]?.[0];

    expect(config).not.toHaveProperty('onSessionMetrics');
    expect(config).not.toHaveProperty('onStreamMetrics');
    expect(config).not.toHaveProperty('metricsIntervalMs');
  });
});
