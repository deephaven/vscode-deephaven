import * as vscode from 'vscode';
import { CONFIG_KEY } from '../common';
import { Logger } from './Logger';

/**
 * Opt-in connect diagnostics, gated behind the
 * `deephaven.diagnostics.connectTiming` setting (off by default) and written to
 * the Deephaven Debug output channel.
 *
 * These exist because a slow connect is not self-explanatory from the outside: a
 * DHE server holding 20k persistent queries took 31.4s to connect, and
 * distinguishing "the extension host is busy" from "the extension host is
 * waiting on the network" was the measurement that identified the cause (a
 * 64KB HTTP/2 receive window capping the controller stream at ~425 KB/s). The
 * event loop was 1.15% blocked — idle — which ruled out every client-side
 * explanation at once.
 *
 * Per-stream throughput is NOT measured here — `@deephaven/jsapi-nodejs` reports
 * it natively via `onStreamMetrics` (wired up in `transportUtils`), including a
 * `consumerTimeMs` that separates a slow connection from a slow consumer. What
 * remains is the event-loop lag sampler, which answers a question the transport
 * cannot see, and the connect-path phase timers.
 *
 * Callers must check {@link isConnectTimingEnabled} before doing any timing
 * work, so that these cost nothing when the setting is off.
 */

const logger = new Logger('ConnectDiagnostics');

/**
 * Whether opt-in connect diagnostics are enabled
 * (`deephaven.diagnostics.connectTiming`, default `false`).
 *
 * Read at each call site rather than cached so toggling the setting takes effect
 * on the next connect without reloading the window.
 */
export function isConnectTimingEnabled(): boolean {
  return (
    vscode.workspace
      .getConfiguration(CONFIG_KEY.root)
      .get<boolean>(CONFIG_KEY.diagnosticsConnectTiming, false) === true
  );
}

/** Shared no-op so a disabled timer allocates nothing per call. */
const noopTimer = (): void => {};

/**
 * Start a phase timer for the connect path. Call the returned function when the
 * phase completes to log its duration.
 *
 * Returns a shared no-op when `deephaven.diagnostics.connectTiming` is off, so
 * disabled diagnostics cost one config read and nothing else — no timestamps, no
 * closures, no log formatting.
 *
 * @example
 * const done = createConnectTimer();
 * await getUserInfo();
 * done('getUserInfo');
 * @returns A function that logs `timing: <label> took <n> ms`.
 */
export function createConnectTimer(): (label: string) => void {
  if (!isConnectTimingEnabled()) {
    return noopTimer;
  }

  const startMs = performance.now();

  return (label: string): void => {
    logger.debug('timing:', label, 'took', performance.now() - startMs, 'ms');
  };
}

/** How often the event loop lag sampler wakes up. */
const LAG_SAMPLE_INTERVAL_MS = 100;

/**
 * Sample event loop lag until the returned function is called, then log it.
 *
 * This is the single measurement that settles whether a slow connect is the
 * extension host doing work or the extension host waiting. A timer set for
 * `LAG_SAMPLE_INTERVAL_MS` that fires late was blocked by synchronous work, so
 * high total lag means CPU-bound (client-side parsing / event dispatch / a
 * quadratic drain) while near-zero lag over a 30s connect means we were idle and
 * the time is upstream (server or network).
 * @param label Description of the operation being sampled, for the log line.
 * @returns A function that stops sampling and logs the result.
 */
export function startEventLoopLagSampler(label: string): () => void {
  const startMs = performance.now();

  let expectedMs = startMs + LAG_SAMPLE_INTERVAL_MS;
  let maxLagMs = 0;
  let totalLagMs = 0;
  let sampleCount = 0;

  const handle = setInterval(() => {
    const nowMs = performance.now();
    const lagMs = nowMs - expectedMs;

    expectedMs = nowMs + LAG_SAMPLE_INTERVAL_MS;
    maxLagMs = Math.max(maxLagMs, lagMs);
    totalLagMs += Math.max(0, lagMs);
    sampleCount += 1;
  }, LAG_SAMPLE_INTERVAL_MS);

  return (): void => {
    clearInterval(handle);

    const elapsedMs = performance.now() - startMs;

    logger.debug(
      'event loop lag during',
      label,
      '- max',
      maxLagMs,
      'ms, total blocked',
      totalLagMs,
      'ms of',
      elapsedMs,
      'ms elapsed (',
      sampleCount,
      'samples,',
      elapsedMs === 0 ? 0 : (totalLagMs / elapsedMs) * 100,
      '% blocked )'
    );
  };
}
