import type { dh as DhcType } from '@deephaven/jsapi-types';
import { NodeHttp2gRPCTransport } from '@deephaven/jsapi-nodejs';

/**
 * Per-stream HTTP/2 receive window (SETTINGS_INITIAL_WINDOW_SIZE), passed
 * through to `http2.connect`.
 *
 * Node defaults both receive windows to 64KB and, unlike browsers, never grows
 * them, which caps a single stream at roughly `window / RTT`. Against a DHE
 * server holding 20k persistent queries that capped the controller's
 * query-config stream at ~425 KB/s and made a connect take 31.4s; 4MiB took the
 * same connect to 8.4s.
 */
const INITIAL_WINDOW_SIZE = 4 * 1024 * 1024;

/**
 * Connection-level HTTP/2 receive window. Shared by every stream on a session,
 * so it is set to 2x {@link INITIAL_WINDOW_SIZE} rather than left to default
 * (which would derive it as equal): the controller stream runs alongside
 * concurrent unary calls (`getToken`, `ping`, `getGroupsForUser`) on the same
 * session, and 4MiB/8MiB is the pair measured end to end.
 */
const SESSION_LOCAL_WINDOW_SIZE = 8 * 1024 * 1024;

let sharedFactory: DhcType.grpc.GrpcTransportFactory | null = null;

/**
 * The gRPC transport factory shared by every Deephaven connection this
 * extension makes — Core/DHC clients, the DHE client, and the Core+ manager
 * behind worker connections.
 *
 * There is deliberately exactly one instance. `createFactory` allocates a
 * session map per call, so calling it per site would open one TCP connection per
 * origin *per site* instead of sharing them, which is what the deprecated static
 * `NodeHttp2gRPCTransport.factory` used to do for free.
 * @returns The shared transport factory.
 */
export function getSharedTransportFactory(): DhcType.grpc.GrpcTransportFactory {
  if (sharedFactory != null) {
    return sharedFactory;
  }

  sharedFactory = NodeHttp2gRPCTransport.createFactory({
    // Not an `http2.connect` option: per RFC 9113 6.9.2 the connection window
    // can only change via a WINDOW_UPDATE on stream 0, so upstream applies this
    // with `session.setLocalWindowSize()` on connect.
    sessionLocalWindowSize: SESSION_LOCAL_WINDOW_SIZE,
    sessionOptions: {
      settings: {
        initialWindowSize: INITIAL_WINDOW_SIZE,
      },
    },
  });

  return sharedFactory;
}
