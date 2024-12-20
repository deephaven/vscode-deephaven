import http2 from 'node:http2';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { assertDefined } from '../util';

type GrpcTransport = DhcType.grpc.GrpcTransport;
type GrpcTransportFactory = DhcType.grpc.GrpcTransportFactory;
type GrpcTransportOptions = DhcType.grpc.GrpcTransportOptions;

export class NodeHttp2gRPCTransport implements GrpcTransport {
  static _sessionMap: Map<string, http2.ClientHttp2Session> = new Map();

  /**
   * TODO: Cleanup requests similar to https://github.com/deephaven/deephaven-core/blob/c05b35957e466fded4da61154ba106cfc3198bc5/web/client-api/src/main/java/io/deephaven/web/client/api/grpc/MultiplexedWebsocketTransport.java#L129
   * Create a Transport instance.
   * @param options Transport options.
   * @returns Transport instance.
   */
  static readonly factory: GrpcTransportFactory = {
    create: options => {
      const { origin } = new URL(options.url);

      if (!NodeHttp2gRPCTransport._sessionMap.has(origin)) {
        const session = http2.connect(origin);
        session.on('error', err => {
          console.error('Session error', err);
        });
        NodeHttp2gRPCTransport._sessionMap.set(origin, session);
      }

      const session = NodeHttp2gRPCTransport._sessionMap.get(origin)!;

      return new NodeHttp2gRPCTransport(options, session);
    },

    get supportsClientStreaming(): boolean {
      return false;
    },
  };

  /**
   * Private constructor to restrict instantiation to static factory method.
   * @param options Transport options.
   * @param session node:http2 session.
   */
  private constructor(
    options: GrpcTransportOptions,
    session: http2.ClientHttp2Session
  ) {
    this._options = options;
    this._session = session;
  }

  private readonly _options: GrpcTransportOptions;
  private readonly _session: http2.ClientHttp2Session;
  private _request: http2.ClientHttp2Stream | null = null;

  _createRequest = (
    headers: Record<string, string> | null
  ): http2.ClientHttp2Stream => {
    const url = new URL(this._options.url);

    const req = this._session.request({
      ...headers,
      // may need to set the :authority header at some point
      ':method': 'POST',
      ':path': url.pathname,
    });

    console.log('[NodeHttp2Transport] _createRequest', url.pathname);

    req.on('response', (headers, _flags) => {
      const headersRecord: Record<string, string | string[]> = {};

      // strip any undefined headers or keys that start with `:`
      for (const name in headers) {
        if (headers[name] != null && !name.startsWith(':')) {
          headersRecord[name] = headers[name];
        }
      }

      this._options.onHeaders(headersRecord, Number(headers[':status']));
    });

    req.on('data', (chunk: Buffer) => {
      this._options.onChunk(chunk);
    });
    req.on('end', () => {
      this._options.onEnd();
    });
    req.on('error', err => {
      this._options.onEnd(err);
    });

    return req;
  };

  start(metadata: { [key: string]: string | Array<string> }): void {
    console.log('[NodeHttp2Transport] start', metadata.headersMap);

    if (this._request != null) {
      throw new Error('start called more than once');
    }

    const headers: Record<string, string> = {};
    Object.entries(metadata).forEach(([key, value]) => {
      headers[key] = typeof value === 'string' ? value : value.join(', ');
    });

    this._request = this._createRequest(headers);
  }

  sendMessage(msgBytes: Uint8Array): void {
    console.log('[NodeHttp2Transport] sendMessage', msgBytes);
    assertDefined(this._request, '_request');
    this._request.write(msgBytes);
  }

  finishSend(): void {
    console.log('[NodeHttp2Transport] finishSend');
    assertDefined(this._request, '_request');
    this._request.end();
  }

  cancel(): void {
    console.log('[NodeHttp2Transport] cancel');
    assertDefined(this._request, '_request');
    this._request.close();
  }

  /**
   * Cleanup.
   */
  static dispose(): void {
    for (const session of NodeHttp2gRPCTransport._sessionMap.values()) {
      session.close();
    }
    NodeHttp2gRPCTransport._sessionMap.clear();
  }
}
