import { UrlPromiseMapCache } from './UrlPromiseMapCache';
import type { IDheService, IDheServiceFactory } from '../../types';

/**
 * Cache `IdheService` instances by URL.
 */
export class DheServiceCache extends UrlPromiseMapCache<IDheService> {
  constructor(dheServiceFactory: IDheServiceFactory) {
    super(async url => {
      return dheServiceFactory.create(url);
    });
  }
}
