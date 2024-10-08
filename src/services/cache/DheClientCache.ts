import type {
  EnterpriseDhType as DheType,
  EnterpriseClient,
} from '@deephaven-enterprise/jsapi-types';
import { URLPromiseMapCache } from './URLPromiseMapCache';
import { createDheClient, getWsUrl } from '../../dh/dhe';
import type { ICacheService } from '../../types';

/**
 * Cache DHE client instances by URL.
 */
export class DheClientCache extends URLPromiseMapCache<EnterpriseClient> {
  constructor(dheJsApiCache: ICacheService<URL, DheType>) {
    super(async (url: URL) => {
      const dhe = await dheJsApiCache.get(url);
      return createDheClient(dhe, getWsUrl(url));
    });
  }
}
