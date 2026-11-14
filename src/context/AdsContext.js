import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import { useAuth } from './AuthContext';
import { useSubscription } from './SubscriptionContext';
import { canUseAdsAccount } from '../services/ads/eligibility';
import { createAdsConfig } from '../services/ads/config';
import { createAdsController } from '../services/ads/controller';
import { createNativeAdsRuntime } from '../services/ads/sdk';
import { createInterstitialController } from '../services/ads/interstitials';
import { createPresentationBlockers } from '../services/ads/presentationBlockers';

const AdsContext = createContext(null);
const config = createAdsConfig({
  platform: Platform.OS,
  dev: __DEV__,
  env: {
    EXPO_PUBLIC_BUILD_PROFILE: process.env.EXPO_PUBLIC_BUILD_PROFILE,
    EXPO_PUBLIC_ADS_ENABLED: process.env.EXPO_PUBLIC_ADS_ENABLED,
    EXPO_PUBLIC_ADS_TEST_MODE: process.env.EXPO_PUBLIC_ADS_TEST_MODE,
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
  const [featureBlocked, setFeatureBlocked] = useState(false);
  const synchronizeBlockers = useRef(() => {});
  const blockers = useRef(null);
  if (!blockers.current)
    blockers.current = createPresentationBlockers(() => synchronizeBlockers.current());
  const baseAccountEligible = canUseAdsAccount({
    authReady,
    userId: user?.id || null,
    subscriptionUserId: subscription.userId || null,
    subscriptionReady: subscription.ready,
    accessVerified: subscription.accessVerified,
    isPro: subscription.isPro,
    pending: subscription.pending,
    loading: subscription.loading,
  });
  const blockedForAds = blocked || featureBlocked || blockers.current.isBlocked();
  const accountEligible = !blockedForAds && baseAccountEligible;
  const eligibility = useRef(null);
  eligibility.current = { identity: user?.id || null, baseAccountEligible, appActive, blocked };
  const gate = useRef(null);
  gate.current = {
    identity: user?.id || null,
    eligible: accountEligible,
    appActive,
    blocked: blockedForAds,
  };
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
  const startBoundary = useRef(null);
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
  synchronizeBlockers.current = () => {
    const current = eligibility.current;
    const held = blockers.current.isBlocked();
    gate.current = {
      identity: current.identity,
      eligible: current.baseAccountEligible && !current.blocked && !held,
      appActive: current.appActive,
      blocked: current.blocked || held,
    };
    controller.current.setGate(gate.current);
    fullscreen.current.setGate(fullscreenGate());
    setFeatureBlocked(held);
  };
  useEffect(() => {
    controller.current.setGate(gate.current);
    fullscreen.current.setGate(fullscreenGate());
  }, [user?.id, accountEligible, appActive, blocked, featureBlocked]);
  useEffect(() => {
    fullscreen.current.setGate(fullscreenGate());
  }, [state.ready, state.canRequestAds]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (status) => {
      const active = status === 'active';
      eligibility.current = { ...eligibility.current, appActive: active };
      gate.current = { ...gate.current, appActive: active };
      controller.current.setGate(gate.current);
      fullscreen.current.setGate(fullscreenGate());
      setAppActive(active);
    });
    return () => {
      listener.remove();
      blockers.current.dispose();
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
  const acquirePresentationBlocker = useCallback(() => blockers.current.acquire(), []);
  const canPresentAds = useCallback(() => {
    const current = gate.current;
    const prepared = controller.current.getState();
    return !!(
      current.eligible &&
      current.appActive &&
      !current.blocked &&
      prepared.ready &&
      prepared.canRequestAds
    );
  }, []);
  const canPrepareMusicStartAd = useCallback(() => {
    const current = eligibility.current;
    // Qualification happens while the caller still owns its music blocker.
    // Actual loading/showing below requires every normal blocker to be gone.
    return !!(
      current.baseAccountEligible &&
      current.appActive &&
      !current.blocked &&
      config.enabled &&
      config.interstitialEnabled &&
      controller.current.hasReusableConsentAndSdk() &&
      runtime.hasInterstitialSupport()
    );
  }, []);
  const showStartInterstitial = useCallback(
    ({ opportunityId, isEligible = () => true, beforePresent } = {}) => {
      if (startBoundary.current) return startBoundary.current;
      const identity = eligibility.current.identity;
      let active = true;
      const current = () => {
        const account = eligibility.current;
        const normal = gate.current;
        try {
          return (
            active &&
            account.identity === identity &&
            account.baseAccountEligible &&
            account.appActive &&
            !account.blocked &&
            normal.identity === identity &&
            normal.eligible &&
            normal.appActive &&
            !normal.blocked &&
            isEligible() === true
          );
        } catch {
          return false;
        }
      };
      if (!canPrepareMusicStartAd() || !current())
        return Promise.resolve({ shown: false, reason: 'ineligible' });
      // The caller also holds preparation for the entire Session action. This
      // nested hold and placement belong only to this cached Start boundary.
      const releaseHold = controller.current.holdPreparation();
      controller.current.setGate(gate.current);
      const releasePlacement = controller.current.acquirePlacement(current);
      const pending = (async () => {
        try {
          if (!controller.current.restoreReadyFromCache(current))
            return { shown: false, reason: 'not-ready' };
          return await showInterstitial({
            opportunityId,
            isEligible: current,
            beforePresent,
            readinessTimeoutMs: 1500,
          });
        } finally {
          active = false;
          releasePlacement();
          fullscreen.current.setGate(fullscreenGate());
          releaseHold();
        }
      })();
      startBoundary.current = pending;
      pending
        .finally(() => {
          if (startBoundary.current === pending) startBoundary.current = null;
        })
        .catch(() => {});
      return pending;
    },
    [canPrepareMusicStartAd, showInterstitial],
  );
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
        featurePresentationBlocked: featureBlocked,
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
        acquirePresentationBlocker,
        canPresentAds,
        canPrepareMusicStartAd,
        showStartInterstitial,
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
