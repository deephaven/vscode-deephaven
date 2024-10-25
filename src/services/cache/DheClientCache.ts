import type { EnterpriseClient } from '@deephaven-enterprise/jsapi-types';
import { ByURLAsyncCache } from './ByURLAsyncCache';
import type { IDheClientFactory } from '../../types';

/**
 * Cache DHE client instances by URL.
 */
export class DheClientCache extends ByURLAsyncCache<EnterpriseClient> {
  constructor(dheClientFactory: IDheClientFactory) {
    super(dheClientFactory);
  }
}
