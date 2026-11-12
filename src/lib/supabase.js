import 'react-native-url-polyfill/auto';
import { createClient, processLock } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAuthSessionStorage } from './authSessionStorage';
import { installNativeAuthCrypto } from './authCrypto';
import { createAuthFetch } from './authFetch';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const authCryptoReady = installNativeAuthCrypto({
  platform: Platform.OS,
  target: globalThis,
  loadNativeCrypto: () => require('expo-crypto'),
});
export const isSupabaseConfigured = Boolean(url && key && authCryptoReady);
export const authStorage =
  Platform.OS === 'web' ? AsyncStorage : createAuthSessionStorage(SecureStore);
export const supabase = isSupabaseConfigured
  ? createClient(url, key, {
      global: { fetch: createAuthFetch(fetch.bind(globalThis), url) },
      auth: {
        storage: authStorage,
        // The pinned SDK's updateUser can otherwise save its captured tokens
        // over a concurrent refresh. Keep SDK reads/refreshes on the same lock.
        lock: processLock,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
        experimental: { appendPkceFlowIdToRedirects: true },
      },
    })
  : null;
