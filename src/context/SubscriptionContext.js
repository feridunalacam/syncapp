import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Linking, NativeModules, Platform } from 'react-native';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { createSubscriptionController } from '../services/subscriptions/controller';

const SubscriptionContext = createContext(null);
const apiKey =
  Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
    : Platform.OS === 'android'
      ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY
      : null;

// Loading the JS SDK with an older development binary can throw during module
// evaluation. Check the native bridge first and keep the free app usable.
function loadSdk() {
  if (!apiKey || !['ios', 'android'].includes(Platform.OS)) return null;
  if (!NativeModules.RNPurchases) return null;
  try {
    return require('react-native-purchases').default;
  } catch {
    return null;
  }
}
const sdk = loadSdk();

async function verifyEntitlement(userId, { sync = false } = {}) {
  if (!supabase) throw new Error('Account services are not available in this build.');
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.user.id !== userId)
    throw new Error('Your account changed. Please try again.');
  let syncError = null;
  if (sync) {
    const { error } = await supabase.functions.invoke('sync-subscription');
    if (error)
      syncError =
        'Subscription verification is temporarily unavailable. Refresh access in a moment.';
  }
  // RLS permits only this user's records. The store SDK alone never enables
  // server-backed features; this record is written only by trusted functions.
  const { data, error } = await supabase
    .from('entitlements')
    .select('entitlement_id,expires_at,store,environment,updated_at')
    .eq('user_id', userId)
    .eq('entitlement_id', 'pro')
    .maybeSingle();
  if (error) throw new Error('Could not verify cloud access. Please try again.');
  return { entitlement: data, syncError };
}

export function SubscriptionProvider({ children }) {
  const { user, ready: authReady } = useAuth();
  const [state, setState] = useState({
    ready: false,
    accessVerified: false,
    configured: !!sdk,
    isPro: false,
    packages: [],
  });
  const controller = useRef(null);
  if (!controller.current) {
    controller.current = createSubscriptionController({
      sdk,
      apiKey,
      verify: verifyEntitlement,
      onChange: setState,
      sdkEntitlementId: process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID || 'sync_pro',
    });
  }
  useEffect(() => {
    if (authReady) controller.current.identify(user?.id).catch(() => {});
  }, [authReady, user?.id]);
  useEffect(() => {
    const timer = setInterval(() => controller.current.expire(), 1000);
    const listener = AppState.addEventListener('change', (status) => {
      if (status === 'active') controller.current.refresh().catch(() => {});
    });
    return () => {
      clearInterval(timer);
      listener.remove();
      controller.current.dispose();
    };
  }, []);
  const manage = useCallback(async () => {
    const url =
      controller.current.getState().customerInfo?.managementURL ||
      (Platform.OS === 'ios'
        ? 'https://apps.apple.com/account/subscriptions'
        : Platform.OS === 'android'
          ? 'https://play.google.com/store/account/subscriptions'
          : null);
    if (!url) throw new Error('Manage your subscription in the store where you purchased it.');
    await Linking.openURL(url);
  }, []);
  // Auth state changes are rendered before the SDK's asynchronous identity switch.
  // Hide the previous user's data immediately, even for that interim render.
  const belongsToUser = state.userId === (user?.id || null);
  const value = {
    ...state,
    ready: authReady && (belongsToUser ? state.ready : false),
    accessVerified: authReady && belongsToUser && !!state.accessVerified,
    isPro: belongsToUser && !!state.isPro,
    entitlement: belongsToUser ? state.entitlement : null,
    customerInfo: belongsToUser ? state.customerInfo : null,
    packages: belongsToUser ? state.packages : [],
    pending: belongsToUser && state.pending,
    loading: belongsToUser && !!state.loading,
    error: belongsToUser ? state.error : null,
    requiresNativeBuild: !!apiKey && !sdk && Platform.OS !== 'web',
    refresh: () => controller.current.refresh({ sync: true }),
    purchase: (pkg) => controller.current.purchase(pkg),
    restore: () => controller.current.restore(),
    manage,
  };
  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const value = useContext(SubscriptionContext);
  if (!value) throw new Error('useSubscription requires SubscriptionProvider.');
  return value;
}
