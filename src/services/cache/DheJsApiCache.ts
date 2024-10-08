import { initDheApi } from '@deephaven/require-jsapi';
import type { EnterpriseDhType as DheType } from '@deephaven-enterprise/jsapi-types';
import { getTempDir, urlToDirectoryName } from '../../util';
import { UrlPromiseMapCache } from './UrlPromiseMapCache';

/**
 * Cache DHE jsapi instances by URL.
 */
export class DheJsApiCache extends UrlPromiseMapCache<DheType> {
  constructor() {
    super(async url =>
      initDheApi(url, getTempDir({ subDirectory: urlToDirectoryName(url) }))
    );
  }
}
