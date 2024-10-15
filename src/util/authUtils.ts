import { generateKeyPairSync } from 'node:crypto';
import type {
  Base64PrivateKey,
  Base64PublicKey,
  DHPrivateKey,
  DHPublicKey,
} from '../types';

// synonymous with secp256r1
const NAMED_CURVE = 'prime256v1' as const;

export function generateBase64KeyPair(): [Base64PublicKey, Base64PrivateKey] {
  const { publicKey: publicKeyBuffer, privateKey: privateKeyBuffer } =
    generateKeyPairSync('ec', {
      namedCurve: NAMED_CURVE,
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    });

  const publicKey = toEcBase64String(publicKeyBuffer) as Base64PublicKey;
  const privateKey = toEcBase64String(privateKeyBuffer) as Base64PrivateKey;

  return [publicKey, privateKey];
}

export function formatDHPublicKey(
  userName: string,
  base64PublicKey: Base64PublicKey
): string {
  return `${userName} ${base64PublicKey}` as DHPublicKey;
}

export function formatDHPrivateKey(
  userName: string,
  operateAs: string,
  base64PublicKey: Base64PublicKey,
  base64PrivateKey: Base64PrivateKey
): string {
  return [
    `user ${userName}`,
    `operateas ${operateAs}`,
    `public ${base64PublicKey}`,
    `private ${base64PrivateKey}`,
  ].join('\n') as DHPrivateKey;
}

/**
 * Prepend 'EC:' to the key and convert to a base64 string.
 * @param keyBuffer
 */
export function toEcBase64String(keyBuffer: Buffer): string {
  const ecSentinel = Buffer.from('EC:');
  return Buffer.concat([ecSentinel, keyBuffer]).toString('base64');
}
