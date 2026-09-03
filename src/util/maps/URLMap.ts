import { SerializedKeyMap } from './SerializedKeyMap';

/**
 * Map that uses URLs as keys. Internally serializes keys to strings for value
 * equality. Since keys are deserialized back to URLs, they will not maintain
 * reference equalty with original keys.
 *
 * A consequence worth knowing: because only the serialized string is kept, this
 * map never retains the `URL` object handed to it, so callers do not need to
 * clone a key before `set`. Values, by contrast, are held by reference — clone
 * a `URL` that is stored *inside* a value if a caller could mutate it.
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
