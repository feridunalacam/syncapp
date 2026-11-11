import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAuthSessionStorage } from './authSessionStorage';
import { installNativeAuthCrypto } from './authCrypto';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const authCryptoReady = installNativeAuthCrypto({
  platform: Platform.OS,
  target: globalThis,
  loadNativeCrypto: () => require('expo-crypto'),
});
export const isSupabaseConfigured = Boolean(url && key && authCryptoReady);
export const supabase = isSupabaseConfigured
  ? createClient(url, key, {
      auth: {
        storage: Platform.OS === 'web' ? AsyncStorage : createAuthSessionStorage(SecureStore),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
        experimental: { appendPkceFlowIdToRedirects: true },
      },
    })
  : null;
