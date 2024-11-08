import type { EnterpriseDhType as DheType } from '@deephaven-enterprise/jsapi-types';
import { getTempDir, urlToDirectoryName } from '../../util';
import { ByURLAsyncCache } from './ByURLAsyncCache';
import { getDhe } from '../../dh/dhe';

/**
 * Cache DHE jsapi instances by URL.
 */
export class DheJsApiCache extends ByURLAsyncCache<DheType> {
  constructor() {
    super(async url =>
      getDhe(url, getTempDir({ subDirectory: urlToDirectoryName(url) }))
    );
  }
}
