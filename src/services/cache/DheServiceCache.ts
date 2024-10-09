import { ByURLAsyncCache } from './ByURLAsyncCache';
import type { IDheService, IDheServiceFactory } from '../../types';

/**
 * Cache `IdheService` instances by URL.
 */
export class DheServiceCache extends ByURLAsyncCache<IDheService> {
  constructor(dheServiceFactory: IDheServiceFactory) {
    super(async url => {
      return dheServiceFactory.create(url);
    });
  }
}
