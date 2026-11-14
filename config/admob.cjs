// Google Mobile Ads app identifiers are public native configuration, not secrets.
// SKAdNetwork list: https://developers.google.com/admob/ios/quick-start (2026-11-09).
const skAdNetworkItems = `cstr6suwn9 4fzdc2evr5 2fnua5tdw4 ydx93a7ass p78axxw29g
v72qych5uu ludvb6z3bs cp8zw746q7 3sh42y64q3 c6k4g5qg8m s39g8k73mm wg4vff78zm
3qy4746246 f38h382jlk hs6bdukanm mlmmfzh3r3 v4nxqhlyqp wzmmz9fp6w su67r6k2v3
yclnxrl5pm t38b2kh725 7ug5zh24hu gta9lk7p23 vutu7akeur y5ghdn5j9k v9wttpbfk9
n38lu8286q 47vhws6wlr kbd757ywx3 9t245vhmpl a2p9lx4jpn 22mmun2rn5 44jx6755aq
k674qkevps 4468km3ulz 2u9pt9hc89 8s468mfl3y klf5c3l5u5 ppxm28t8ap kbmxgpxpgc
uw77j35x4d 578prtvx9j 4dzt52r2t5 tl55sbb4fm c3frkrj4fj e5fvkxwrpn 8c4e2ghe7u
3rd42ekr43 97r2b46745 3qcr597p9d`
  .split(/\s+/)
  .map((id) => `${id}.skadnetwork`);

module.exports = function nativeAdMobOptions(env = {}) {
  const iosAppId = env.ADMOB_IOS_APP_ID || 'ca-app-pub-3940256099942544~1458002511';
  const androidAppId = env.ADMOB_ANDROID_APP_ID || 'ca-app-pub-3940256099942544~3347511713';
  for (const id of [iosAppId, androidAppId]) {
    if (!/^ca-app-pub-\d{16}~\d{10}$/.test(id)) throw new Error('Invalid AdMob app ID.');
  }
  const release = ['preview', 'production'].includes(env.EAS_BUILD_PROFILE);
  if (release && env.EXPO_PUBLIC_ADS_ENABLED === 'true') {
    if ([iosAppId, androidAppId].some((id) => id.includes('3940256099942544'))) {
      throw new Error('Live ads require real iOS and Android AdMob app IDs.');
    }
  }
  return {
    iosAppId,
    androidAppId,
    delayAppMeasurementInit: true,
    userTrackingUsageDescription:
      'Your device’s advertising identifier helps Google measure ad performance and limit repeated ads in Sync.',
    optimizeInitialization: true,
    optimizeAdLoading: true,
    skAdNetworkItems,
  };
};
