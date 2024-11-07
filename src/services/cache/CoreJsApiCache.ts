import { initDhcApi } from '@deephaven/require-jsapi';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { getTempDir, urlToDirectoryName } from '../../util';
import { ByURLAsyncCache } from './ByURLAsyncCache';

/**
 * Cache Core jsapi instances by URL.
 */
export class CoreJsApiCache extends ByURLAsyncCache<typeof DhcType> {
  constructor() {
    super(async url =>
      initDhcApi(url, getTempDir({ subDirectory: urlToDirectoryName(url) }))
    );
  }
}
