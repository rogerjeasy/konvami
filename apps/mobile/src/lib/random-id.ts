/**
 * A random id in the UUID (version 4) format: the platform's own where it has one, otherwise
 * made from `Math.random`. For ids that only have to be unique (an install, an offline rating),
 * never for a security token.
 */
export function randomUuid(): string {
  const crypto = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (crypto?.randomUUID) return crypto.randomUUID();
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  // The version (4) and the variant (8 to b) digits of a version 4 UUID.
  hex[12] = '4';
  hex[16] = (8 + Math.floor(Math.random() * 4)).toString(16);
  const text = hex.join('');
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
}
