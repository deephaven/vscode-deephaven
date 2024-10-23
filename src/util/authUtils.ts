import { generateKeyPairSync, sign } from 'node:crypto';
import type {
  Base64Nonce,
  Base64PrivateKey,
  Base64PublicKey,
  Base64Signature,
  DHPrivateKey,
  DHPublicKey,
} from '../types';

/*
 * Base64 encoded value of 'EC:'. Used to identify that a key is an EC key when
 * passing to DH server.
 */
export const EC_SENTINEL = 'RUM6' as const;

/*
 * Named curve to use for generating key pairs.
 * Note that 'prime256v1' is synonymous with 'secp256r1'.
 */
const NAMED_CURVE = 'prime256v1' as const;

/**
 * Generate a base64 encoded asymmetric key pair using eliptic curve.
 * @returns A tuple containing the base64 encoded public and private keys.
 */
export function generateBase64KeyPair(): [Base64PublicKey, Base64PrivateKey] {
  const { publicKey: publicKeyBuffer, privateKey: privateKeyBuffer } =
    generateKeyPairSync('ec', {
      namedCurve: NAMED_CURVE,
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    });

  const publicKey = publicKeyBuffer.toString('base64') as Base64PublicKey;
  const privateKey = privateKeyBuffer.toString('base64') as Base64PrivateKey;

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
 * Sign a nonce using a private key.
 * @param nonce
 * @param privateKey
 * @returns The base64 encoded signature.
 */
export function signWithPrivateKey(
  nonce: Base64Nonce,
  privateKey: Base64PrivateKey
): Base64Signature {
  const nonceBytes = Buffer.from(nonce, 'base64');
  const privateKeyBytes = Buffer.from(privateKey, 'base64');

  return sign('sha256', nonceBytes, {
    key: privateKeyBytes,
    format: 'der',
    type: 'pkcs8',
  }).toString('base64') as Base64Signature;
}
