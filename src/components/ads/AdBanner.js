import React, { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { useWorkout } from '../../context/WorkoutContext';
import { useTheme } from '../../context/ThemeContext';
import { useAds } from '../../context/AdsContext';
import { canPrepareAds, canShowBanner, canUseAdsAccount } from '../../services/ads/eligibility';

// A creative exists only inside a currently eligible placement. Retired native
// callbacks cannot revive a banner after a route/account/workout change.
function Creative({ Component, unitId, size, width, requestOptions }) {
  const { theme } = useTheme();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  if (failed) return null;
  return (
    <View style={[styles.creative, { width }, loaded ? styles.loaded : styles.loading]}>
      {loaded && <Text style={[styles.label, { color: theme.textSecondary }]}>Advertisement</Text>}
      <View style={styles.nativeFrame}>
        <Component
          unitId={unitId}
          size={size}
          width={width}
          requestOptions={requestOptions}
          onAdLoaded={() => {
            if (alive.current) setLoaded(true);
          }}
          onAdFailedToLoad={() => {
            if (alive.current) setFailed(true);
          }}
        />
      </View>
    </View>
  );
}

export default function AdBanner({ placementVisible = true, hasBlockingModal = false }) {
  const ads = useAds();
  const auth = useAuth();
  const subscription = useSubscription();
  const workout = useWorkout();
  const focused = useIsFocused();
  const { width: windowWidth } = useWindowDimensions();
  const [appState, setAppState] = useState(AppState.currentState);
  const [measurement, setMeasurement] = useState(null);
  useEffect(() => {
    const listener = AppState.addEventListener('change', setAppState);
    return () => listener.remove();
  }, []);
  const availableWidth = Math.max(0, Math.floor(windowWidth - 40));
  const measuredWidth = measurement?.windowWidth === windowWidth ? measurement.width : null;
  const width = measuredWidth === null ? null : Math.min(measuredWidth, availableWidth);
  const accountEligible =
    ads.accountEligible === true &&
    canUseAdsAccount({
      authReady: auth.ready,
      userId: auth.user?.id || null,
      subscriptionUserId: subscription.userId || null,
      subscriptionReady: subscription.ready,
      accessVerified: subscription.accessVerified,
      isPro: subscription.isPro,
      pending: subscription.pending,
      loading: subscription.loading,
    });
  const flags = {
    accountEligible,
    appActive: appState === 'active',
    screenFocused: !!focused,
    placementVisible: !!placementVisible && availableWidth > 0,
    hasBlockingModal: !!hasBlockingModal || !!auth.recoveryMode,
    isWorkoutRunning: workout?.isWorkoutRunning,
    isMusicPlaying: workout?.isMusicPlaying,
    isAudioSyncing: workout?.isAudioSyncing,
  };
  const prepare = !!workout && canPrepareAds(flags);
  const prepareRef = useRef(false);
  prepareRef.current = prepare;
  const acquirePlacement = ads.acquirePlacement;
  useEffect(() => {
    if (prepare) return acquirePlacement(() => prepareRef.current);
    return undefined;
  }, [prepare, acquirePlacement]);
  const visible =
    prepare &&
    canShowBanner({
      ...flags,
      consentReady: !!ads.consentReady && !!ads.canRequestAds,
      sdkReady: !!ads.initialized,
    });
  if (!prepare) return null;
  return (
    <View
      style={styles.placement}
      onLayout={({ nativeEvent }) => {
        const next = Math.floor(nativeEvent.layout.width);
        if (next !== measuredWidth) setMeasurement({ width: next, windowWidth });
      }}
    >
      {visible && width > 0 && ads.BannerComponent && ads.bannerUnitId && ads.bannerSize && (
        <Creative
          key={`${auth.user?.id || 'guest'}:${ads.bannerUnitId}:${width}`}
          Component={ads.BannerComponent}
          unitId={ads.bannerUnitId}
          size={ads.bannerSize}
          width={width}
          requestOptions={ads.requestOptions}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  placement: { alignSelf: 'stretch' },
  creative: { alignSelf: 'center' },
  loading: { height: 0, overflow: 'hidden' },
  loaded: { marginTop: 16, marginBottom: 16 },
  label: { fontSize: 10, lineHeight: 16, paddingHorizontal: 2, marginBottom: 5 },
  nativeFrame: { alignItems: 'center', justifyContent: 'center' },
});
