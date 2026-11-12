// No React Native/package import at module evaluation: old development builds
// and web remain usable when the ads native bridge has not been installed.
export function createNativeAdsRuntime({ platform, getNativeModule, load }) {
  let sdk;
  let configuration;
  let initialization;
  let initialized = false;
  const hasNativeSupport = () => {
    if (platform !== 'ios' && platform !== 'android') return false;
    try {
      return !!(
        getNativeModule('RNGoogleMobileAdsModule') &&
        getNativeModule('RNGoogleMobileAdsConsentModule')
      );
    } catch {
      return false;
    }
  };
  const hasInterstitialSupport = () => {
    if (!hasNativeSupport()) return false;
    try {
      return !!getNativeModule('RNGoogleMobileAdsInterstitialModule');
    } catch {
      return false;
    }
  };
  return {
    // Capability detection must not evaluate the ads package or initialize GMA.
    // Settings can expose privacy choices even before a Free placement exists.
    hasNativeSupport,
    hasInterstitialSupport,
    getSdk() {
      if (sdk) return sdk;
      if (!hasNativeSupport()) return null;
      try {
        const module = load();
        if (!module?.AdsConsent || !module?.BannerAd || typeof module.default !== 'function')
          return null;
        const interstitialAvailable =
          hasInterstitialSupport() &&
          typeof module.InterstitialAd?.createForAdRequest === 'function' &&
          ['LOADED', 'OPENED', 'CLOSED', 'ERROR'].every(
            (event) => typeof module.AdEventType?.[event] === 'string',
          );
        sdk = {
          consent: module.AdsConsent,
          mobileAds: module.default(),
          BannerComponent: module.BannerAd,
          bannerSize: module.BannerAdSize.LARGE_ANCHORED_ADAPTIVE_BANNER,
          testBannerUnitId: module.TestIds.ADAPTIVE_BANNER,
          createInterstitial: interstitialAvailable
            ? (unitId, requestOptions) =>
                module.InterstitialAd.createForAdRequest(unitId, requestOptions)
            : null,
          interstitialEvents: interstitialAvailable
            ? Object.freeze({
                loaded: module.AdEventType.LOADED,
                opened: module.AdEventType.OPENED,
                closed: module.AdEventType.CLOSED,
                error: module.AdEventType.ERROR,
              })
            : null,
          testInterstitialUnitId: module.TestIds.INTERSTITIAL,
        };
        return sdk;
      } catch {
        return null;
      }
    },
    configure(requestConfiguration) {
      if (!configuration) {
        const current = this.getSdk();
        if (!current) return Promise.reject(new Error('Ads require an updated native build.'));
        configuration = Promise.resolve().then(async () => {
          // Banner creatives can contain video. Silence the ad SDK before it
          // initializes so a creative cannot interrupt the app's music.
          await current.mobileAds.setAppMuted(true);
          await current.mobileAds.setAppVolume(0);
          await current.mobileAds.setRequestConfiguration(requestConfiguration);
        });
      }
      return configuration;
    },
    initialize() {
      if (!initialization) {
        const current = this.getSdk();
        if (!current) return Promise.reject(new Error('Ads require an updated native build.'));
        // Retain even a failed initialization promise: never repeatedly start
        // native SDK initialization when identities or placement leases change.
        // Invoke immediately after the controller's eligibility check, rather
        // than deferring the native call to a later microtask/account state.
        try {
          initialization = Promise.resolve(current.mobileAds.initialize()).then(() => {
            initialized = true;
          });
        } catch (error) {
          initialization = Promise.reject(error);
        }
      }
      return initialization;
    },
    isInitialized: () => initialized,
  };
}
