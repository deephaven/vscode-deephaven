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

    // The per-stream window is an `http2.connect` setting; the connection window
    // is not (RFC 9113 6.9.2) and is applied via `setLocalWindowSize` upstream.
    expect(createFactoryMock.mock.calls[0]?.[0]).toEqual({
      sessionLocalWindowSize: 8 * 1024 * 1024,
      sessionOptions: {
        settings: {
          initialWindowSize: 4 * 1024 * 1024,
        },
      },
    });
  });

  it('should not configure a connection window below the stream window', () => {
    getSharedTransportFactory();

    // Upstream throws on this, since the connection window caps every stream.
    const config = createFactoryMock.mock.calls[0]?.[0];

    expect(config?.sessionLocalWindowSize).toBeGreaterThanOrEqual(
      config?.sessionOptions?.settings?.initialWindowSize ?? 0
    );
  });
});
