// A missing account or subscription signal is unknown, not confirmed Free.
// Stable guests need no backend entitlement; signed-in accounts require a
// successful current-identity backend check, including any requested sync.
export function canUseAdsAccount({
  authReady,
  userId,
  subscriptionUserId,
  subscriptionReady,
  accessVerified,
  isPro,
  pending,
  loading,
} = {}) {
  if (
    authReady !== true ||
    subscriptionReady !== true ||
    isPro !== false ||
    pending !== false ||
    loading !== false
  )
    return false;
  if (userId === null) return subscriptionUserId === null;
  return (
    typeof userId === 'string' &&
    userId.length > 0 &&
    subscriptionUserId === userId &&
    accessVerified === true
  );
}

// Use this before even loading native ad/consent modules. Re-check the same
// placement conditions when consent or SDK initialization completes.
export function canPrepareAds({
  accountEligible,
  appActive,
  screenFocused,
  placementVisible,
  hasBlockingModal = false,
  isWorkoutRunning,
  isMusicPlaying,
  isAudioSyncing,
} = {}) {
  return (
    accountEligible === true &&
    appActive === true &&
    screenFocused === true &&
    placementVisible === true &&
    hasBlockingModal === false &&
    isWorkoutRunning === false &&
    isMusicPlaying === false &&
    isAudioSyncing === false
  );
}

export function canShowBanner({ consentReady, sdkReady, ...placement } = {}) {
  return consentReady === true && sdkReady === true && canPrepareAds(placement);
}
