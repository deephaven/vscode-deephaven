/**
 * Factory for creating gRPC transports.
 */
export interface GrpcTransportFactory {
  /**
   * Create a new transport instance.
   * @param options - options for creating the transport
   * @return a transport instance to use for gRPC communication
   */
  create(options: GrpcTransportOptions): GrpcTransport;
  /**
   * Return true to signal that created transports may have {@link GrpcTransport.sendMessage} called on it
   * more than once before {@link GrpcTransport.finishSend} should be called.
   * @return true to signal that the implementation can stream multiple messages, false otherwise indicating that
   *         Open/Next gRPC calls should be used
   */
  get supportsClientStreaming(): boolean;
}
/**
 * Options for creating a gRPC stream transport instance.
 */
export interface GrpcTransportOptions {
  /**
   * The gRPC method URL.
   */
  url: URL;
  /**
   * True to enable debug logging for this stream.
   */
  debug: boolean;
  /**
   * Callback for when headers and status are received. The headers are a map of header names to values, and the
   * status is the HTTP status code. If the connection could not be made, the status should be 0.
   */
  onHeaders: (
    headers: { [key: string]: string | Array<string> },
    status: number
  ) => void;
  /**
   * Callback for when a chunk of data is received.
   */
  onChunk: (chunk: Uint8Array) => void;
  /**
   * Callback for when the stream ends, with an error instance if it can be provided. Note that the present
   * implementation does not consume errors, even if provided.
   */
  onEnd: (error?: Error | undefined | null) => void;
}
/**
 * gRPC transport implementation.
 */
export interface GrpcTransport {
  /**
   * Starts the stream, sending metadata to the server.
   * @param metadata - the headers to send the server when opening the connection
   */
  start(metadata: { [key: string]: string | Array<string> }): void;
  /**
   * Sends a message to the server.
   * @param msgBytes - bytes to send to the server
   */
  sendMessage(msgBytes: Uint8Array): void;
  /**
   * "Half close" the stream, signaling to the server that no more messages will be sent, but that the client is still
   * open to receiving messages.
   */
  finishSend(): void;
  /**
   * End the stream, both notifying the server that no more messages will be sent nor received, and preventing the
   * client from receiving any more events.
   */
  cancel(): void;
}
