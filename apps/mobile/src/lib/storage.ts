import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Small key-value store for device-only settings (never personal data). Native uses the
 * Keychain / Keystore, scoped to this device so it is not restored onto another phone; the web
 * build (development previews) uses localStorage. Every call fails soft: a broken store means
 * defaults, never a crash.
 */
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const isWeb = Platform.OS === 'web';

export async function readItem(key: string): Promise<string | null> {
  try {
    return isWeb
      ? (globalThis.localStorage?.getItem(key) ?? null)
      : await SecureStore.getItemAsync(key, OPTIONS);
  } catch {
    return null;
  }
}

export async function writeItem(key: string, value: string): Promise<void> {
  try {
    if (isWeb) globalThis.localStorage?.setItem(key, value);
    else await SecureStore.setItemAsync(key, value, OPTIONS);
  } catch {
    // Not saved: the setting applies for this session only.
  }
}

export async function removeItem(key: string): Promise<void> {
  try {
    if (isWeb) globalThis.localStorage?.removeItem(key);
    else await SecureStore.deleteItemAsync(key, OPTIONS);
  } catch {
    // Not removed: the old value applies until the next successful write.
  }
}
