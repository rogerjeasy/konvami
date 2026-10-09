import { Platform } from 'react-native';
import { readItem, removeItem, writeItem } from '@/lib/storage';
import type { User } from './types';

/**
 * What survives an app restart for a signed-in user: the refresh token and a small copy of the
 * user, in the Keychain / Keystore (this device only). Access tokens are never stored.
 *
 * The record is split into parts because some iOS versions refuse Keychain items above about
 * 2048 bytes, and a Cognito refresh token alone can be larger than that.
 */
export interface SavedSession {
  refreshToken: string;
  user: User;
}

const KEY = 'konvami.auth.session';
// Characters per stored part: under the ~2048-byte Keychain limit, with room for non-ASCII names.
const PART_LENGTH = 1800;

const countKey = `${KEY}.count`;
const partKey = (index: number) => `${KEY}.${index}`;

// The web build is a development preview: its session lives in memory and ends with the tab.
const inMemory = Platform.OS === 'web';
let memory: SavedSession | null = null;

async function savedPartCount(): Promise<number> {
  const count = Number(await readItem(countKey));
  return Number.isInteger(count) && count > 0 ? count : 0;
}

export async function saveSession(session: SavedSession): Promise<void> {
  if (inMemory) {
    memory = session;
    return;
  }
  const text = JSON.stringify(session);
  const parts = Array.from({ length: Math.ceil(text.length / PART_LENGTH) }, (_, i) =>
    text.slice(i * PART_LENGTH, (i + 1) * PART_LENGTH),
  );
  const previous = await savedPartCount();
  await Promise.all(parts.map((part, i) => writeItem(partKey(i), part)));
  await writeItem(countKey, String(parts.length));
  // A shorter record must not leave the tail of a longer one behind.
  await Promise.all(
    Array.from({ length: Math.max(previous - parts.length, 0) }, (_, i) =>
      removeItem(partKey(parts.length + i)),
    ),
  );
}

export async function loadSavedSession(): Promise<SavedSession | null> {
  if (inMemory) return memory;
  const count = await savedPartCount();
  if (count === 0) return null;
  const parts = await Promise.all(Array.from({ length: count }, (_, i) => readItem(partKey(i))));
  if (parts.some((part) => part === null)) return null;
  try {
    const saved = JSON.parse(parts.join('')) as Partial<SavedSession>;
    return typeof saved.refreshToken === 'string' && saved.user
      ? { refreshToken: saved.refreshToken, user: saved.user }
      : null;
  } catch {
    return null;
  }
}

export async function clearSavedSession(): Promise<void> {
  memory = null;
  if (inMemory) return;
  const count = await savedPartCount();
  await Promise.all([
    removeItem(countKey),
    ...Array.from({ length: count }, (_, i) => removeItem(partKey(i))),
  ]);
}
