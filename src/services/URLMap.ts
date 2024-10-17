import { SerializedKeyMap } from './SerializedKeyMap';

/**
 * Map that uses URLs as keys. Internally serializes keys to strings for value
 * equality. Since keys are deserialized back to URLs, they will not maintain
 * reference equalty with original keys.
 */
export class URLMap<T, TURL extends URL = URL> extends SerializedKeyMap<
  TURL,
  T
> {
  deserializeKey(urlString: string): TURL {
    return new URL(urlString) as TURL;
  }

  serializeKey(url: TURL): string {
    return url.toString();
  }
}
