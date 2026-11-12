import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useAds } from '../context/AdsContext';
import { canPrepareAds } from '../services/ads/eligibility';
import { createSessionAdActions } from '../services/ads/sessionActions';
import { stopCuePreview, stopWorkoutCues } from '../services/alerts/player';

// A native full-screen dismissal can arrive just before iOS becomes active.
// This bounded wait never releases an ad itself or starts a background workout.
function waitForForeground() {
  if (AppState.currentState === 'active') return Promise.resolve(true);
  return new Promise((resolve) => {
    let timer;
    const finish = (active) => {
      clearTimeout(timer);
      subscription.remove();
      resolve(active);
    };
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') finish(true);
    });
    timer = setTimeout(() => finish(false), 1500);
  });
}

export default function useSessionAds({ workout, blocked, sessionKey, onFinish }) {
  const ads = useAds();
  const auth = useAuth();
  const focused = useIsFocused();
  const [busy, setBusy] = useState(false);
  const actionSequence = useRef(0);
  const hold = useRef(null);
  const latest = useRef(null);
  latest.current = { workout, ads, auth, focused, blocked, sessionKey, onFinish };
  const prepare =
    !!workout.selectedRoutine &&
    ads.interstitialEnabled &&
    canPrepareAds({
      accountEligible: ads.accountEligible,
      appActive: ads.appActive,
      screenFocused: focused,
      placementVisible: true,
      hasBlockingModal: !!blocked || !!auth.recoveryMode,
      isWorkoutRunning: workout.isWorkoutRunning,
      isMusicPlaying: workout.isMusicPlaying,
      isAudioSyncing: workout.isAudioSyncing,
    });
  const prepareRef = useRef(false);
  prepareRef.current = prepare;
  const actions = useRef(null);
  if (!actions.current)
    actions.current = createSessionAdActions({
      getState: () => {
        const current = latest.current;
        return {
          identity: current.auth.user?.id || null,
          routine: current.workout.selectedRoutine,
          sessionKey: current.sessionKey,
          active: current.workout.isWorkoutRunning,
          focused: current.focused,
          appActive: AppState.currentState === 'active',
          blocked:
            !!current.blocked || !!current.auth.recoveryMode || !!current.ads.presenterBlocked,
          musicPlaying: current.workout.isMusicPlaying,
          audioSyncing: current.workout.isAudioSyncing,
        };
      },
      stopAudioPreview: async () => {
        await stopCuePreview();
        await stopWorkoutCues();
      },
      waitForAdsIdle: () => latest.current.ads.waitForAdPresenters(),
      showAd: (options) => latest.current.ads.showInterstitial(options),
      waitForForeground,
      startSession: () => {
        // Block the placement synchronously before timer.start commits audio.
        prepareRef.current = false;
        return latest.current.workout.beginSession(latest.current.workout.selectedRoutine);
      },
      finishSession: (key) => latest.current.onFinish(key),
      onBusy: (next) => {
        if (next && !hold.current) hold.current = latest.current.ads.holdAdPreparation();
        setBusy(next);
      },
    });
  useEffect(() => {
    if (!busy) {
      hold.current?.();
      hold.current = null;
    }
  }, [busy]);
  useEffect(() => {
    if (!prepare) return undefined;
    return ads.acquirePlacement(() => prepareRef.current);
  }, [prepare, ads.acquirePlacement]);
  useEffect(() => {
    if (prepare && ads.ready && !busy) ads.preloadInterstitial(() => prepareRef.current);
  }, [prepare, ads.ready, busy, ads.preloadInterstitial]);
  useEffect(
    () => () => {
      prepareRef.current = false;
      actions.current.dispose();
      hold.current?.();
      hold.current = null;
    },
    [],
  );
  return {
    busy,
    adSupported: ads.accountEligible && ads.interstitialEnabled,
    startOrToggle() {
      if (latest.current.workout.isWorkoutRunning) return latest.current.workout.toggle();
      const opportunityId = `start:${Date.now()}:${++actionSequence.current}`;
      return actions.current.start({ opportunityId });
    },
    finish() {
      return actions.current.finish({ opportunityId: `finish:${latest.current.sessionKey}` });
    },
    recordRoutineSelection() {
      const current = latest.current;
      current.ads.recordInterstitialAction({
        opportunityId: `routine:${Date.now()}:${++actionSequence.current}`,
        isEligible: () =>
          current.focused &&
          !current.workout.isWorkoutRunning &&
          !current.auth.recoveryMode &&
          AppState.currentState === 'active',
      });
    },
  };
}
