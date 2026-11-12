import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Linking, NativeModules, Platform } from 'react-native';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAccountScopeResolver, createBillingScopeRegistry } from '../lib/accountBillingScope';
import { verifyAccountEntitlement } from '../services/subscriptions/accountAccess';
import { createSubscriptionController } from '../services/subscriptions/controller';
import { createSubscriptionConfig, loadSubscriptionSdk } from '../services/subscriptions/config';

const SubscriptionContext = createContext(null);
const configuration = {
  platform: Platform.OS,
  dev: __DEV__,
  profile: process.env.EXPO_PUBLIC_BUILD_PROFILE,
  env: {
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
    EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
    EXPO_PUBLIC_REVENUECAT_REVIEW_IOS_API_KEY:
      process.env.EXPO_PUBLIC_REVENUECAT_REVIEW_IOS_API_KEY,
  },
};
const purchaseConfig = createSubscriptionConfig(configuration);
const reviewConfig = createSubscriptionConfig({ ...configuration, lane: 'review' });
const apiKey = purchaseConfig.apiKey;
const registry = createBillingScopeRegistry(AsyncStorage);
const resolveScope = createAccountScopeResolver({ client: supabase, registry });

// Loading the JS SDK with an older development binary can throw during module
// evaluation. Check the native bridge first and keep the free app usable.
const sdk = loadSubscriptionSdk(
  { enabled: purchaseConfig.enabled || reviewConfig.enabled },
  {
    hasNativeModule: !!NativeModules.RNPurchases,
    load: () => require('react-native-purchases').default,
  },
);

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
  const appState = useRef(AppState.currentState);
  if (!controller.current) {
    controller.current = createSubscriptionController({
      sdk,
      apiKey,
      apiKeyForScope: (scope) =>
        scope.lane === 'review' ? reviewConfig.apiKey : purchaseConfig.apiKey,
      resolveScope,
      loadScope: (id) => registry.load(id),
      verify: (id, options) => verifyAccountEntitlement(supabase, id, options),
      onChange: setState,
      sdkEntitlementId: process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID || 'sync_pro',
    });
  }
  useEffect(() => {
    if (authReady) controller.current.identify(user?.id).catch(() => {});
  }, [authReady, user?.id]);
  useEffect(() => {
    const timer = setInterval(() => {
      controller.current.expire();
      controller.current
        .renewReviewAccess({ foreground: appState.current === 'active' })
        .catch(() => {});
    }, 1000);
    const listener = AppState.addEventListener('change', (status) => {
      appState.current = status;
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
    scope: belongsToUser ? state.scope : null,
    scopeConfirmed: authReady && belongsToUser && !!state.scopeConfirmed,
    ready: authReady && (belongsToUser ? state.ready : false),
    accessVerified: authReady && belongsToUser && !!state.accessVerified,
    isPro: belongsToUser && !!state.isPro,
    entitlement: belongsToUser ? state.entitlement : null,
    customerInfo: belongsToUser ? state.customerInfo : null,
    packages: belongsToUser ? state.packages : [],
    pending: belongsToUser && state.pending,
    loading: belongsToUser && !!state.loading,
    error: belongsToUser ? state.error : null,
    requiresNativeBuild:
      !!(state.scope?.lane === 'review' ? reviewConfig.apiKey : apiKey) &&
      !sdk &&
      Platform.OS !== 'web',
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
