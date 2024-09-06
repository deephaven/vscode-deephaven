import { SerializedKeyMap } from './SerializedKeyMap';

/**
 * Map that uses URLs as keys. Internally serializes keys to strings for value
 * equality. Since keys are deserialized back to URLs, they will not maintain
 * reference equalty with original keys.
 */
export class URLMap<T> extends SerializedKeyMap<URL, T> {
  deserializeKey(urlString: string): URL {
    return new URL(urlString);
  }

  serializeKey(url: URL): string {
    return url.toString();
  }
}
