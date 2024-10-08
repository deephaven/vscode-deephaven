import { nanoid } from 'nanoid';
import type { UniqueID } from '../types';

/**
 * Generate a unique id.
 * @param size The size of the id to generate. Defaults to 21 since that is what
 * nanoid uses as its default.
 */
export function uniqueId(size: number = 21): UniqueID {
  return nanoid(size) as UniqueID;
}
