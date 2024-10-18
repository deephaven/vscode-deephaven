import { initDheApi } from '@deephaven/require-jsapi';
import type { EnterpriseDhType as DheType } from '@deephaven-enterprise/jsapi-types';
import { getTempDir, urlToDirectoryName } from '../../util';
import { ByURLAsyncCache } from './ByURLAsyncCache';

/**
 * Cache DHE jsapi instances by URL.
 */
export class DheJsApiCache extends ByURLAsyncCache<DheType> {
  constructor() {
    super(async url =>
      initDheApi(url, getTempDir({ subDirectory: urlToDirectoryName(url) }))
    );
  }
}
