import { URLPromiseMapCache } from './URLPromiseMapCache';
import type { IDheService, IDheServiceFactory } from '../../types';

/**
 * Cache `IdheService` instances by URL.
 */
export class DheServiceCache extends URLPromiseMapCache<IDheService> {
  constructor(dheServiceFactory: IDheServiceFactory) {
    super(async url => {
      return dheServiceFactory.create(url);
    });
  }
}
