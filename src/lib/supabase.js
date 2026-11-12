import 'react-native-url-polyfill/auto';
import { createClient, processLock } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAuthSessionStorage } from './authSessionStorage';
import { installNativeAuthCrypto } from './authCrypto';
import { createAuthFetch } from './authFetch';
import { createAuthCredentialWriters } from './authCredentialWrites';
import { createAuthRecoveryStorage } from './authRecoveryStorage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
// Match Supabase's existing default so installed sessions retain their storage slot.
const authStorageKey = url ? `sb-${new URL(url).hostname.split('.')[0]}-auth-token` : null;
const authCryptoReady = installNativeAuthCrypto({
  platform: Platform.OS,
  target: globalThis,
  loadNativeCrypto: () => require('expo-crypto'),
});
export const isSupabaseConfigured = Boolean(url && key && authCryptoReady);
export const authStorage =
  Platform.OS === 'web' ? AsyncStorage : createAuthSessionStorage(SecureStore);
const authFetch = isSupabaseConfigured ? createAuthFetch(fetch.bind(globalThis), url) : null;
export const supabase = isSupabaseConfigured
  ? createClient(url, key, {
      global: { fetch: authFetch },
      auth: {
        storageKey: authStorageKey,
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
// A failed refresh of an older main session must not erase a pending recovery.
// Only PKCE state is durable here; this client's session/user slots are memory-only.
const recoveryStorageKey = `${authStorageKey}-recovery-v1`;
export const authRecoveryStorage = isSupabaseConfigured
  ? createAuthRecoveryStorage({ storage: authStorage, storageKey: recoveryStorageKey })
  : null;
const recoveryClient = isSupabaseConfigured
  ? createClient(url, key, {
      global: {
        fetch: (input, options) =>
          authFetch(input, { ...options, signal: authRecoveryStorage.signal || options?.signal }),
      },
      auth: {
        storageKey: recoveryStorageKey,
        storage: authRecoveryStorage.storage,
        // recoveryStorage.run owns every operation, and this client never
        // refreshes. A second legacy SDK lock is unnecessary here.
        autoRefreshToken: false,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
        experimental: { appendPkceFlowIdToRedirects: true },
      },
    }).auth
  : null;
// Do not expose another session writer, signOut or auto-refresh controller.
export const authRecoveryClient = recoveryClient
  ? Object.freeze({
      initialize: () => recoveryClient.initialize(),
      resetPasswordForEmail: (email, options) =>
        recoveryClient.resetPasswordForEmail(email, options),
      exchangeCodeForSession: (code, options) =>
        recoveryClient.exchangeCodeForSession(code, options),
    })
  : null;
export const authCredentialWriters = supabase
  ? createAuthCredentialWriters({
      auth: supabase.auth,
      storageKey: authStorageKey,
      lock: processLock,
    })
  : null;
export const signInWithNativeIdToken = authCredentialWriters?.signInWithIdToken;
