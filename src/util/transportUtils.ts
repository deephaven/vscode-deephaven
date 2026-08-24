import type { dh as DhcType } from '@deephaven/jsapi-types';
import { NodeHttp2gRPCTransport } from '@deephaven/jsapi-nodejs';
import { Logger } from './Logger';
import { isConnectTimingEnabled } from './connectDiagnostics';

const logger = new Logger('TransportUtils');

/**
 * Per-stream HTTP/2 receive window.
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
 * so it is set to 2x {@link INITIAL_WINDOW_SIZE} rather than left to the
 * upstream default (which would derive it as equal): the controller stream runs
 * alongside concurrent unary calls (`getToken`, `ping`, `getGroupsForUser`) on
 * the same session, and 4MiB/8MiB is the pair measured end to end.
 */
const SESSION_WINDOW_SIZE = 8 * 1024 * 1024;

/** Emit interval metrics for long-lived streams (e.g. controller subscribe). */
const METRICS_INTERVAL_MS = 5000;

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
 *
 * The diagnostics setting is read once, when the factory is first created: the
 * metrics callbacks are part of its config, and the transport skips all metrics
 * accounting when they are absent. Toggling
 * `deephaven.diagnostics.connectTiming` therefore affects transport metrics only
 * after a window reload (the `createConnectTimer` phase timings, read per call,
 * take effect immediately).
 * @returns The shared transport factory.
 */
export function getSharedTransportFactory(): DhcType.grpc.GrpcTransportFactory {
  if (sharedFactory != null) {
    return sharedFactory;
  }

  const isDiagnosticsEnabled = isConnectTimingEnabled();

  sharedFactory = NodeHttp2gRPCTransport.createFactory({
    // Not gated on diagnostics — the window sizes are the fix, not
    // instrumentation.
    initialWindowSize: INITIAL_WINDOW_SIZE,
    sessionWindowSize: SESSION_WINDOW_SIZE,

    ...(isDiagnosticsEnabled
      ? {
          metricsIntervalMs: METRICS_INTERVAL_MS,
          onSessionMetrics: (metrics): void => {
            logger.debug('http2 session', metrics);
          },
          onStreamMetrics: (metrics): void => {
            logger.debug('http2 stream', metrics);
          },
        }
      : {}),
  });

  return sharedFactory;
}
