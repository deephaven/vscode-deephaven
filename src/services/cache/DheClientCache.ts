import type {
  EnterpriseDhType as DheType,
  EnterpriseClient,
} from '@deephaven-enterprise/jsapi-types';
import { ByURLAsyncCache } from './ByURLAsyncCache';
import { createDheClient, getWsUrl } from '../../dh/dhe';
import type { IAsyncCacheService } from '../../types';

/**
 * Cache DHE client instances by URL.
 */
export class DheClientCache extends ByURLAsyncCache<EnterpriseClient> {
  constructor(dheJsApiCache: IAsyncCacheService<URL, DheType>) {
    super(async (url: URL) => {
      const dhe = await dheJsApiCache.get(url);
      return createDheClient(dhe, getWsUrl(url));
    });
  }
}
