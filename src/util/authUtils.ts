import { generateKeyPairSync } from 'node:crypto';
import type { DHKeyPair, DHPrivateKey, DHPublicKey } from '../types';

// synonymous with secp256r1
const NAMED_CURVE = 'prime256v1' as const;

/**
 * Generate a new keypair in Deephaven format.
 * @param userName The userName to generate the keypair for.
 */
export function generateKeyPairForUser<TUser extends string>(
  userName: TUser
): DHKeyPair {
  const { publicKey: publicKeyBuffer, privateKey: privateKeyBuffer } =
    generateKeyPairSync('ec', {
      namedCurve: NAMED_CURVE,
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    });

  const publicBase64Str = toEcBase64String(publicKeyBuffer);
  const privateBase64Str = toEcBase64String(privateKeyBuffer);

  const publicKey = `${userName} ${publicBase64Str}` as DHPublicKey;
  const privateKey = [
    `user ${userName}`,
    `operateas ${userName}`,
    `public ${publicBase64Str}`,
    `private ${privateBase64Str}`,
  ].join('\n') as DHPrivateKey;

  return {
    publicKey,
    privateKey,
  };
}

/**
 * Prepend 'EC:' to the key and convert to a base64 string.
 * @param keyBuffer
 */
export function toEcBase64String(keyBuffer: Buffer): string {
  const ecSentinel = Buffer.from('EC:');
  return Buffer.concat([ecSentinel, keyBuffer]).toString('base64');
}
