import type { OfflineDisk } from './cache';

const keyOf = (key: string) => `konvami.offline.${key}`;
/** The preview uses localStorage's atomic replacement; quota failures remain visible. */
export const deviceOfflineDisk: OfflineDisk = {
  read: async (key) => globalThis.localStorage.getItem(keyOf(key)),
  write: async (key, value) => globalThis.localStorage.setItem(keyOf(key), value),
  remove: async (key) => globalThis.localStorage.removeItem(keyOf(key)),
};
