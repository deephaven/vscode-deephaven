import { CacheByUrlService } from '../CacheByUrlService';
import type { IDheService, IDheServiceFactory } from '../../types';

/**
 * Cache `IdheService` instances by URL.
 */
export class DheServiceCache extends CacheByUrlService<IDheService> {
  constructor(dheServiceFactory: IDheServiceFactory) {
    super(async url => {
      return dheServiceFactory.create(url);
    });
  }
}
