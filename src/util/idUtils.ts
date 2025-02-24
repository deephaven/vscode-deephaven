import { customAlphabet, urlAlphabet } from 'nanoid';
import type { UniqueID } from '../types';

// The default nanoid alphabet includes `_`. Using custom alphabet without it
// to make ids group better in `_` delimited strings.
const nanoidCustom = customAlphabet(urlAlphabet.replace('_', ''), 21);

/**
 * Generate a unique id.
 * @param size The size of the id to generate. Defaults to 21 since that is what
 * nanoid uses as its default.
 */
export function uniqueId(size: number = 21): UniqueID {
  return nanoidCustom(size) as UniqueID;
}
