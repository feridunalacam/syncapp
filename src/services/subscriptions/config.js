// RevenueCat's native SDK intentionally stops release builds configured with a
// Test Store key. Reject unsuitable keys before loading/configuring that SDK.
// Public store key prefixes: appl_ (Apple), goog_ (Google Play), test_ (debug).
export function createSubscriptionConfig({
  platform,
  dev = false,
  profile,
  env = {},
  lane = 'production',
} = {}) {
  const keyName =
    lane === 'review'
      ? platform === 'ios'
        ? 'EXPO_PUBLIC_REVENUECAT_REVIEW_IOS_API_KEY'
        : null
      : platform === 'ios'
        ? 'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY'
        : platform === 'android'
          ? 'EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY'
          : null;
  const key = keyName ? env[keyName] : null;
  let reason = null;
  if (!['production', 'review'].includes(lane) || !keyName) reason = 'unsupported-platform';
  else if (typeof key !== 'string' || key.length === 0) reason = 'missing-key';
  else if (key.startsWith('sk_')) reason = 'private-key';
  else if (key.trim() !== key || !/^(?:appl|goog|test)_[A-Za-z0-9]+$/.test(key))
    reason = 'invalid-key';
  else if (key.startsWith('test_')) {
    if (lane === 'review' || dev !== true || ['preview', 'production'].includes(profile))
      reason = 'test-store-release';
  } else if (!key.startsWith(platform === 'ios' ? 'appl_' : 'goog_')) reason = 'wrong-platform';
  if (!reason && lane === 'review' && key === env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY)
    reason = 'review-key-matches-production';
  return Object.freeze({
    enabled: !reason,
    apiKey: reason ? null : key,
    testMode: !reason && key.startsWith('test_'),
    reason,
  });
}

export function loadSubscriptionSdk(config, { hasNativeModule, load } = {}) {
  if (!config?.enabled || hasNativeModule !== true || typeof load !== 'function') return null;
  try {
    return load();
  } catch {
    return null;
  }
}
