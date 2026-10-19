import 'react-native-url-polyfill/auto';

import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// The Supabase session contains a refresh token, which is a long-lived
// credential. It goes in the keychain / Android keystore, not AsyncStorage,
// which is plain unencrypted files any process with disk access can read.
//
// SecureStore caps values at 2048 bytes and a session with a large JWT can
// exceed that, so oversized values are split across numbered chunks.

const CHUNK_LIMIT = 1800;

// SecureStore has no web implementation. On web the session falls back to
// AsyncStorage (localStorage), which is what every browser app does — the
// keychain guarantee simply does not exist there. Native builds, which are what
// ship to patients, always get the keychain.
const useSecureStore = Platform.OS !== 'web';

export const store = {
  get: (key: string) =>
    useSecureStore ? SecureStore.getItemAsync(key) : AsyncStorage.getItem(key),
  set: (key: string, value: string) =>
    useSecureStore ? SecureStore.setItemAsync(key, value) : AsyncStorage.setItem(key, value),
  remove: (key: string) =>
    useSecureStore ? SecureStore.deleteItemAsync(key) : AsyncStorage.removeItem(key),
};

const SecureStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    const head = await store.get(key);
    if (head === null) return null;
    if (!head.startsWith('__chunks__:')) return head;

    const count = Number(head.slice('__chunks__:'.length));
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await store.get(`${key}.${i}`);
      if (part === null) return null; // A partial write is not a usable session.
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    await this.removeItem(key);

    if (value.length <= CHUNK_LIMIT) {
      await store.set(key, value);
      return;
    }

    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_LIMIT) {
      chunks.push(value.slice(i, i + CHUNK_LIMIT));
    }
    for (let i = 0; i < chunks.length; i++) {
      await store.set(`${key}.${i}`, chunks[i]);
    }
    await store.set(key, `__chunks__:${chunks.length}`);
  },

  async removeItem(key: string): Promise<void> {
    const head = await store.get(key);
    if (head?.startsWith('__chunks__:')) {
      const count = Number(head.slice('__chunks__:'.length));
      for (let i = 0; i < count; i++) {
        await store.remove(`${key}.${i}`);
      }
    }
    await store.remove(key);
  },
};

const extra = Constants.expoConfig?.extra ?? {};
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? (extra.supabaseUrl as string | undefined);
const anonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? (extra.supabaseAnonKey as string | undefined);

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'anon', {
  auth: {
    storage: SecureStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    // There is no browser URL to read a session out of in a native app.
    detectSessionInUrl: false,
  },
});
