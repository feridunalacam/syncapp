const TEST_PUBLISHER = '3940256099942544';

export const NON_PERSONALIZED_REQUEST = Object.freeze({ requestNonPersonalizedAdsOnly: true });

const isRealUnit = (value) =>
  typeof value === 'string' &&
  value.trim() === value &&
  /^ca-app-pub-\d{16}\/\d{10}$/.test(value) &&
  !value.includes(TEST_PUBLISHER);

// Development always uses Google's demo inventory. A release build must be
// explicitly enabled with its own ad unit; it never falls back to demo IDs.
export function createAdsConfig({ platform, dev = false, env = {} } = {}) {
  const native = platform === 'ios' || platform === 'android';
  const bannerUnitId =
    platform === 'ios'
      ? env.EXPO_PUBLIC_ADMOB_IOS_BANNER_ID
      : env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID;
  const interstitialUnitId =
    platform === 'ios'
      ? env.EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL_ID
      : env.EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID;
  const globallyEnabled =
    native &&
    (dev ? env.EXPO_PUBLIC_ADS_ENABLED !== 'false' : env.EXPO_PUBLIC_ADS_ENABLED === 'true');
  const bannerEnabled = globallyEnabled && (dev || isRealUnit(bannerUnitId));
  const interstitialEnabled = globallyEnabled && (dev || isRealUnit(interstitialUnitId));
  return Object.freeze({
    enabled: bannerEnabled || interstitialEnabled,
    bannerEnabled,
    interstitialEnabled,
    testMode: !!dev,
    bannerUnitId: !dev && isRealUnit(bannerUnitId) ? bannerUnitId : null,
    interstitialUnitId: !dev && isRealUnit(interstitialUnitId) ? interstitialUnitId : null,
    requestOptions: NON_PERSONALIZED_REQUEST,
    requestConfiguration: Object.freeze({
      // Keep this app's banner inventory suitable for a general audience. This
      // is a content filter, not an assertion about the user's age.
      maxAdContentRating: 'G',
      ...(dev ? { testDeviceIdentifiers: ['EMULATOR'] } : {}),
    }),
  });
}
