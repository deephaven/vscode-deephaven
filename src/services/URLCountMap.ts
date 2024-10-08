import { URLMap } from './URLMap';

/**
 * Map for keeping track of the count of URLs.
 */
export class URLCountMap<TURL extends URL = URL> extends URLMap<number, TURL> {
  /**
   * Get the count for the given URL.
   * @param url The URL to get the count for.
   * @returns
   */
  get(url: TURL): number {
    return super.get(url) ?? 0;
  }

  /**
   * Increment the count for the given URL.
   * @param url The URL to increment the count for.
   */
  increment(url: TURL): void {
    const count = this.get(url) ?? 0;
    this.set(url, count + 1);
  }

  /**
   * Decrement the count for the given URL.
   * @param url The URL to decrement the count for.
   */
  decrement(url: TURL): void {
    const count = this.get(url) ?? 0;
    if (count > 1) {
      this.set(url, count - 1);
    } else {
      this.delete(url);
    }
  }
}
