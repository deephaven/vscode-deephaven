import type { dh as DhcType } from '@deephaven/jsapi-types';
import { getTempDir, urlToDirectoryName } from '../../util';
import { ByURLAsyncCache } from './ByURLAsyncCache';
import { getDhc } from '../../dh/dhc';

/**
 * Cache Core jsapi instances by URL.
 */
export class CoreJsApiCache extends ByURLAsyncCache<typeof DhcType> {
  constructor() {
    super(async url =>
      getDhc(url, getTempDir({ subDirectory: urlToDirectoryName(url) }))
    );
  }
}
