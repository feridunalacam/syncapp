import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import { useAuth } from './AuthContext';
import { useSubscription } from './SubscriptionContext';
import { canUseAdsAccount } from '../services/ads/eligibility';
import { createAdsConfig } from '../services/ads/config';
import { createAdsController } from '../services/ads/controller';
import { createNativeAdsRuntime } from '../services/ads/sdk';
import { createInterstitialController } from '../services/ads/interstitials';

const AdsContext = createContext(null);
const config = createAdsConfig({
  platform: Platform.OS,
  dev: __DEV__,
  env: {
    EXPO_PUBLIC_ADS_ENABLED: process.env.EXPO_PUBLIC_ADS_ENABLED,
    EXPO_PUBLIC_ADMOB_IOS_BANNER_ID: process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER_ID,
    EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID: process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID,
    EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL_ID: process.env.EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL_ID,
    EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID:
      process.env.EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID,
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
  const [interstitialState, setInterstitialState] = useState({
    loaded: false,
    loading: false,
    presenting: false,
  });
  const controller = useRef(null);
  if (!controller.current)
    controller.current = createAdsController({
      runtime,
      config,
      onChange: setState,
      getCurrentGate: () => gate.current,
    });
  const fullscreen = useRef(null);
  const presentation = useRef(null);
  const fullscreenGate = () => ({
    ...gate.current,
    ready:
      controller.current.getState().ready === true &&
      controller.current.getState().canRequestAds === true,
  });
  if (!fullscreen.current)
    fullscreen.current = createInterstitialController({
      getSdk: () => runtime.getSdk(),
      config,
      getCurrentGate: fullscreenGate,
      onChange: setInterstitialState,
    });
  useEffect(() => {
    controller.current.setGate(gate.current);
    fullscreen.current.setGate(fullscreenGate());
  }, [user?.id, accountEligible, appActive, blocked]);
  useEffect(() => {
    fullscreen.current.setGate(fullscreenGate());
  }, [state.ready, state.canRequestAds]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (status) => {
      const active = status === 'active';
      gate.current = { ...gate.current, appActive: active };
      controller.current.setGate(gate.current);
      fullscreen.current.setGate(fullscreenGate());
      setAppActive(active);
    });
    return () => {
      listener.remove();
      controller.current.dispose();
      fullscreen.current.dispose();
    };
  }, []);
  const acquirePlacement = useCallback(
    (isEligible) => controller.current.acquirePlacement(isEligible),
    [],
  );
  const requestPrivacyOptions = useCallback(async (isEligible) => {
    if (fullscreen.current.getState().presenting)
      return { changed: false, status: 'UNKNOWN', error: 'Please finish the current ad first.' };
    const changed = await controller.current.requestPrivacyOptions(isEligible);
    const latest = controller.current.getState();
    return {
      changed: changed === true,
      status: latest.privacyOptionsRequirementStatus,
      error: latest.error,
    };
  }, []);
  const preloadInterstitial = useCallback((isEligible) => {
    fullscreen.current.setGate(fullscreenGate());
    return fullscreen.current.preload(isEligible);
  }, []);
  const showInterstitial = useCallback((options) => {
    fullscreen.current.setGate(fullscreenGate());
    const pending = fullscreen.current.showIfReady(options);
    presentation.current = pending;
    pending
      .finally(() => {
        if (presentation.current === pending) presentation.current = null;
      })
      .catch(() => {});
    return pending;
  }, []);
  const recordInterstitialAction = useCallback((options) => {
    fullscreen.current.setGate(fullscreenGate());
    return fullscreen.current.recordAction(options);
  }, []);
  const cancelInterstitialPreparation = useCallback(() => fullscreen.current.invalidate(), []);
  const waitForAdPresenters = useCallback(
    () => Promise.allSettled([controller.current.waitUntilIdle(), presentation.current]),
    [],
  );
  const holdAdPreparation = useCallback(() => controller.current.holdPreparation(), []);
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
        presenterBlocked: blocked,
        adsEnabled: config.enabled,
        bannerEnabled: config.bannerEnabled && !interstitialState.presenting,
        interstitialEnabled: config.interstitialEnabled && runtime.hasInterstitialSupport(),
        interstitialPresenting: interstitialState.presenting,
        interstitialLoaded: interstitialState.loaded,
        preloadInterstitial,
        showInterstitial,
        recordInterstitialAction,
        cancelInterstitialPreparation,
        waitForAdPresenters,
        holdAdPreparation,
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
