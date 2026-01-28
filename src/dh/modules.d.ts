/**
 * Augment types that are missing in current jsapi-types.
 */
declare module '@deephaven-enterprise/jsapi-types' {
  interface EnterpriseClient {
    deleteQueries(querySerials: string[]): Promise<void>;
  }
}

export {};

/**
 * TODO: These types were copied from core until deephaven/deephaven-core#7451
 * merges / is released. Then we can do a version bump of jsapi-types and remove
 * this module augmentation.
 */
declare module '@deephaven/jsapi-types' {
  namespace dh {
    interface CoreClient {
      getRemoteFileSourceService(): Promise<dh.remotefilesource.RemoteFileSourceService>;
    }
  }

  namespace dh.remotefilesource {
    interface ResourceRequestEvent {
      respond(content: string | Uint8Array | undefined | null): void;
      get resourceName(): string;
    }

    class RemoteFileSourceService {
      static readonly EVENT_REQUEST_SOURCE: string;

      addEventListener<T>(
        name: string,
        callback: (e: dh.Event<T>) => void
      ): () => void;

      setExecutionContext(resourcePaths?: string[]): Promise<boolean>;
      close(): void;
    }
  }
}
