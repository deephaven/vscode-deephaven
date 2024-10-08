import { UrlKeyCache } from './UrlKeyCache';
import type { IDheService, IDheServiceFactory } from '../../types';

/**
 * Cache `IdheService` instances by URL.
 */
export class DheServiceCache extends UrlKeyCache<IDheService> {
  constructor(dheServiceFactory: IDheServiceFactory) {
    super(async url => {
      return dheServiceFactory.create(url);
    });
  }
}
