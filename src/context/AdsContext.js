import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import { useAuth } from './AuthContext';
import { useSubscription } from './SubscriptionContext';
import { canUseAdsAccount } from '../services/ads/eligibility';
import { createAdsConfig } from '../services/ads/config';
import { createAdsController } from '../services/ads/controller';
import { createNativeAdsRuntime } from '../services/ads/sdk';

const AdsContext = createContext(null);
const config = createAdsConfig({
  platform: Platform.OS,
  dev: __DEV__,
  env: {
    EXPO_PUBLIC_ADS_ENABLED: process.env.EXPO_PUBLIC_ADS_ENABLED,
    EXPO_PUBLIC_ADMOB_IOS_BANNER_ID: process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER_ID,
    EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID: process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID,
  },
});
// This runtime survives account/placement changes. Google initialization is
// process-wide and is never restarted for another Sync account.
const runtime = createNativeAdsRuntime({
  platform: Platform.OS,
  getNativeModule: (name) => TurboModuleRegistry.get(name) || NativeModules[name],
  load: () => require('react-native-google-mobile-ads'),
});

export function AdsProvider({ children, blocked = false }) {
  const { user, ready: authReady } = useAuth();
  const subscription = useSubscription();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const accountEligible =
    !blocked &&
    canUseAdsAccount({
      authReady,
      userId: user?.id || null,
      subscriptionUserId: subscription.userId || null,
      subscriptionReady: subscription.ready,
      accessVerified: subscription.accessVerified,
      isPro: subscription.isPro,
      pending: subscription.pending,
      loading: subscription.loading,
    });
  const gate = useRef(null);
  gate.current = { identity: user?.id || null, eligible: accountEligible, appActive, blocked };
  const [state, setState] = useState({ ready: false });
  const controller = useRef(null);
  if (!controller.current)
    controller.current = createAdsController({
      runtime,
      config,
      onChange: setState,
      getCurrentGate: () => gate.current,
    });
  useEffect(() => {
    controller.current.setGate(gate.current);
  }, [user?.id, accountEligible, appActive, blocked]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (status) => {
      const active = status === 'active';
      gate.current = { ...gate.current, appActive: active };
      controller.current.setGate(gate.current);
      setAppActive(active);
    });
    return () => {
      listener.remove();
      controller.current.dispose();
    };
  }, []);
  const acquirePlacement = useCallback(
    (isEligible) => controller.current.acquirePlacement(isEligible),
    [],
  );
  const requestPrivacyOptions = useCallback(async (isEligible) => {
    const changed = await controller.current.requestPrivacyOptions(isEligible);
    const latest = controller.current.getState();
    return {
      changed: changed === true,
      status: latest.privacyOptionsRequirementStatus,
      error: latest.error,
    };
  }, []);
  const safe = accountEligible && appActive;
  return (
    <AdsContext.Provider
      value={{
        ...controller.current.getState(),
        ...state,
        ready: safe && !!state.ready,
        canRequestAds: safe && !!state.canRequestAds,
        consentReady: safe && !!state.consentReady,
        accountEligible,
        appActive,
        acquirePlacement,
        requestPrivacyOptions,
      }}
    >
      {children}
    </AdsContext.Provider>
  );
}

export function useAds() {
  const value = useContext(AdsContext);
  if (!value) throw new Error('useAds requires AdsProvider.');
  return value;
}
