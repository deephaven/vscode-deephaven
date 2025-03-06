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

/*
 * Create base-64 encoded key from a random string with the length no less than
 * 96 (required by the DH authentication server).
 */
export function makeSAMLSessionKey(): string {
  let key = '';
  for (let i = 0; i < 96; i += 1) {
    key += String.fromCharCode(Math.floor(Math.random() * 255));
  }

  return (
    Buffer.from(key, 'binary')
      .toString('base64')
      // VS Code seems to inconsistently encode Uris when using `vscode.env.openExternal`.
      // When opening URLs directly, encoded characters get double-encoded. When
      // copying the URL to the clipboard, they do not. Non-encoded characters
      // seem to be left alone in both scenarios. This is problematic for the `+`
      // character for SAML session keys.
      // - If we encode the key before opening, VS Code will sometimes double-encode
      //   it, and sometimes leave it alone
      //   See https://github.com/microsoft/vscode/issues/242569
      // - If we don't encode the key before opening, VS Code leaves it alone,
      //   but DH server stores it as ' ' instead of `+`
      // It's possible could address this on DH server, but seems easier to just
      // replace any `+` characters.
      .replace(/[+]/g, 'x')
  );
}
