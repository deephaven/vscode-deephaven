export {};

/**
 * TODO: These types were copied from core until deephaven/deephaven-core#7451
 * merges / is released. Then we can do a version bump of jsapi-types and remove
 * this module augmentation.
 */
declare module '@deephaven/jsapi-types' {
  namespace dh {
    interface CoreClient {
      // Ideally this should always remain optional even after #7451 lands
      // since gplus servers may still have older versions of Core+ prior to
      // the PR. We don't yet have a great way to account for differeing types
      // across Core+ versions, so this will likely show as required once upstream
      // changes. TBD how to handle this.
      getRemoteFileSourceService?(): Promise<dh.remotefilesource.RemoteFileSourceService>;
    }
  }

  namespace dh.remotefilesource {
    interface ResourceRequestEvent {
      respond(content: string | Uint8Array | undefined | null): void;
      get resourceName(): string;
    }

    interface RemoteFileSourceService {
      addEventListener<T>(
        name: string,
        callback: (e: dh.Event<T>) => void
      ): () => void;

      setExecutionContext(
        isDirty: boolean,
        resourcePaths?: string[]
      ): Promise<boolean>;
      close(): void;
    }
  }
}
