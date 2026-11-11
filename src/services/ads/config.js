const TEST_PUBLISHER = '3940256099942544';

export const NON_PERSONALIZED_REQUEST = Object.freeze({ requestNonPersonalizedAdsOnly: true });

// Development always uses Google's demo inventory. A release build must be
// explicitly enabled with its own ad unit; it never falls back to demo IDs.
export function createAdsConfig({ platform, dev = false, env = {} } = {}) {
  const native = platform === 'ios' || platform === 'android';
  const bannerUnitId =
    platform === 'ios'
      ? env.EXPO_PUBLIC_ADMOB_IOS_BANNER_ID
      : env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID;
  const realUnit =
    typeof bannerUnitId === 'string' &&
    /^ca-app-pub-\d{16}\/\d{10}$/.test(bannerUnitId) &&
    !bannerUnitId.includes(TEST_PUBLISHER);
  const enabled =
    native &&
    (dev
      ? env.EXPO_PUBLIC_ADS_ENABLED !== 'false'
      : env.EXPO_PUBLIC_ADS_ENABLED === 'true' && realUnit);
  return Object.freeze({
    enabled,
    testMode: !!dev,
    bannerUnitId: dev ? null : realUnit ? bannerUnitId : null,
    requestOptions: NON_PERSONALIZED_REQUEST,
    requestConfiguration: Object.freeze({
      // Keep this app's banner inventory suitable for a general audience. This
      // is a content filter, not an assertion about the user's age.
      maxAdContentRating: 'G',
      ...(dev ? { testDeviceIdentifiers: ['EMULATOR'] } : {}),
    }),
  });
}
