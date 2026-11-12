import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdsConfig } from '../src/services/ads/config.js';
import { createNativeAdsRuntime } from '../src/services/ads/sdk.js';
import { createAdsController } from '../src/services/ads/controller.js';
import { createInterstitialController } from '../src/services/ads/interstitials.js';

const liveBanner = 'ca-app-pub-1234567890123456/1234567890';
const liveInterstitial = 'ca-app-pub-1234567890123456/9876543210';

function runtimeFixture(overrides = {}, hasInterstitialNative = true) {
  const calls = [];
  const ad = { load() {}, show() {}, addAdEventListener() {}, destroy() {} };
  const module = {
    default: () => ({ initialize: async () => calls.push('initialize') }),
    AdsConsent: {},
    BannerAd: () => null,
    BannerAdSize: { LARGE_ANCHORED_ADAPTIVE_BANNER: 'adaptive' },
    TestIds: { ADAPTIVE_BANNER: 'demo-banner', INTERSTITIAL: 'demo-interstitial' },
    InterstitialAd: {
      createForAdRequest: (unitId, requestOptions) => {
        calls.push({ unitId, requestOptions });
        return ad;
      },
    },
    AdEventType: { LOADED: 'loaded', OPENED: 'opened', CLOSED: 'closed', ERROR: 'error' },
    ...overrides,
  };
  let loads = 0;
  const runtime = createNativeAdsRuntime({
    platform: 'ios',
    getNativeModule: (name) =>
      name === 'RNGoogleMobileAdsInterstitialModule' ? hasInterstitialNative : true,
    load: () => {
      loads++;
      return module;
    },
  });
  return { runtime, calls, ad, loads: () => loads };
}

test('development uses demo inventory for both formats, independently from real configured IDs', () => {
  const config = createAdsConfig({
    platform: 'ios',
    dev: true,
    env: {
      EXPO_PUBLIC_ADMOB_IOS_BANNER_ID: liveBanner,
      EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL_ID: liveInterstitial,
    },
  });
  assert.equal(config.enabled, true);
  assert.equal(config.bannerEnabled, true);
  assert.equal(config.interstitialEnabled, true);
  assert.equal(config.bannerUnitId, null);
  assert.equal(config.interstitialUnitId, null);
  assert.deepEqual(config.requestOptions, { requestNonPersonalizedAdsOnly: true });
  for (const platform of ['ios', 'android', 'web']) {
    const disabled = createAdsConfig({
      platform,
      dev: true,
      env: { EXPO_PUBLIC_ADS_ENABLED: 'false' },
    });
    assert.equal(disabled.enabled, false);
    assert.equal(disabled.bannerEnabled, false);
    assert.equal(disabled.interstitialEnabled, false);
  }
});

test('release enables each valid real format independently and selects only its platform unit', () => {
  const env = {
    EXPO_PUBLIC_ADS_ENABLED: 'true',
    EXPO_PUBLIC_ADMOB_IOS_BANNER_ID: liveBanner,
    EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID: liveInterstitial,
  };
  const ios = createAdsConfig({ platform: 'ios', env });
  assert.equal(ios.enabled, true);
  assert.equal(ios.bannerEnabled, true);
  assert.equal(ios.interstitialEnabled, false);
  assert.equal(ios.interstitialUnitId, null);
  const android = createAdsConfig({ platform: 'android', env });
  assert.equal(android.enabled, true);
  assert.equal(android.bannerEnabled, false);
  assert.equal(android.interstitialEnabled, true);
  assert.equal(android.interstitialUnitId, liveInterstitial);
  assert.equal(android.bannerUnitId, null);
  const web = createAdsConfig({ platform: 'web', env });
  assert.equal(web.enabled, false);
  assert.equal(web.interstitialEnabled, false);
});

test('standalone test inventory requires the exact preview profile and explicit valid flag', () => {
  const profiles = [undefined, '', 'development', 'production', 'unknown', 'Preview', 'preview'];
  const flags = [undefined, 'false', 'true', '', 'TRUE', ' true', 'false ', '0', null, true, false];
  for (const platform of ['ios', 'android', 'web']) {
    for (const profile of profiles) {
      for (const flag of flags) {
        const config = createAdsConfig({
          platform,
          env: {
            EXPO_PUBLIC_BUILD_PROFILE: profile,
            EXPO_PUBLIC_ADS_ENABLED: 'true',
            EXPO_PUBLIC_ADS_TEST_MODE: flag,
            EXPO_PUBLIC_ADMOB_IOS_BANNER_ID: liveBanner,
            EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL_ID: liveInterstitial,
            EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID: liveBanner,
            EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID: liveInterstitial,
          },
        });
        const previewTestMode = profile === 'preview' && flag === 'true';
        const expectedEnabled =
          platform !== 'web' && (flag === undefined || flag === 'false' || previewTestMode);
        const label = `${platform}/${String(profile)}/${String(flag)}`;
        assert.equal(config.enabled, expectedEnabled, label);
        assert.equal(config.bannerEnabled, expectedEnabled, label);
        assert.equal(config.interstitialEnabled, expectedEnabled, label);
        assert.equal(config.testMode, previewTestMode, label);
      }
    }
  }
});

test('preview test mode preserves release opt-in and rejects invalid or demo configured units', () => {
  const env = {
    EXPO_PUBLIC_BUILD_PROFILE: 'preview',
    EXPO_PUBLIC_ADS_TEST_MODE: 'true',
    EXPO_PUBLIC_ADS_ENABLED: 'true',
  };
  for (const platform of ['ios', 'android']) {
    const prefix = `EXPO_PUBLIC_ADMOB_${platform.toUpperCase()}`;
    for (const format of ['BANNER', 'INTERSTITIAL']) {
      for (const id of [
        undefined,
        '',
        'invalid',
        'ca-app-pub-3940256099942544/4411468910',
        `${liveBanner}\n`,
      ]) {
        const config = createAdsConfig({
          platform,
          env: { ...env, [`${prefix}_${format}_ID`]: id },
        });
        assert.equal(config.enabled, false, `${platform}/${format}/${String(id)}`);
      }
    }
    for (const enabled of [undefined, 'false', 'TRUE', null]) {
      const config = createAdsConfig({
        platform,
        env: {
          ...env,
          EXPO_PUBLIC_ADS_ENABLED: enabled,
          [`${prefix}_BANNER_ID`]: liveBanner,
          [`${prefix}_INTERSTITIAL_ID`]: liveInterstitial,
        },
      });
      assert.equal(config.enabled, false, `${platform}/${String(enabled)}`);
    }
  }
});

test('development remains demo-only regardless of standalone QA flags or profile', () => {
  for (const profile of [undefined, 'preview', 'production']) {
    for (const flag of [undefined, 'false', 'true', 'malformed']) {
      const config = createAdsConfig({
        platform: 'ios',
        dev: true,
        env: { EXPO_PUBLIC_BUILD_PROFILE: profile, EXPO_PUBLIC_ADS_TEST_MODE: flag },
      });
      assert.equal(config.enabled, true);
      assert.equal(config.testMode, true);
      assert.equal(config.bannerUnitId, null);
      assert.equal(config.interstitialUnitId, null);
    }
  }
});

test('standalone preview routes both formats through SDK TestIds without changing request policy', async () => {
  const info = { canRequestAds: true, privacyOptionsRequirementStatus: 'NOT_REQUIRED' };
  const app = runtimeFixture({
    AdsConsent: {
      requestInfoUpdate: async () => info,
      loadAndShowConsentFormIfRequired: async () => info,
    },
    default: () => ({
      setAppMuted: async () => {},
      setAppVolume: async () => {},
      setRequestConfiguration: async () => {},
      initialize: async () => {},
    }),
  });
  const config = createAdsConfig({
    platform: 'ios',
    env: {
      EXPO_PUBLIC_BUILD_PROFILE: 'preview',
      EXPO_PUBLIC_ADS_ENABLED: 'true',
      EXPO_PUBLIC_ADS_TEST_MODE: 'true',
      EXPO_PUBLIC_ADMOB_IOS_BANNER_ID: liveBanner,
      EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL_ID: liveInterstitial,
    },
  });
  const gate = { identity: null, eligible: true, appActive: true, blocked: false };
  const controller = createAdsController({
    runtime: app.runtime,
    config,
    getCurrentGate: () => gate,
  });
  const release = controller.acquirePlacement(() => true);
  controller.setGate(gate);
  await controller.waitUntilIdle();
  assert.equal(controller.getState().ready, true);
  assert.equal(controller.getState().bannerUnitId, 'demo-banner');
  const interstitial = createInterstitialController({
    getSdk: () => app.runtime.getSdk(),
    config,
    getCurrentGate: () => ({ ...gate, ready: true }),
  });
  interstitial.setGate({ ...gate, ready: true });
  assert.equal(
    interstitial.preload(() => true),
    true,
  );
  assert.deepEqual(app.calls, [
    { unitId: 'demo-interstitial', requestOptions: { requestNonPersonalizedAdsOnly: true } },
  ]);
  assert.deepEqual(config.requestConfiguration, { maxAdContentRating: 'G' });
  interstitial.dispose();
  release();
  controller.dispose();
});

test('unsafe standalone test flags cannot evaluate the SDK even with an eligible release placement', async () => {
  for (const [profile, flag] of [
    ['production', 'true'],
    [undefined, 'true'],
    ['preview', 'TRUE'],
  ]) {
    const app = runtimeFixture();
    const config = createAdsConfig({
      platform: 'ios',
      env: {
        EXPO_PUBLIC_BUILD_PROFILE: profile,
        EXPO_PUBLIC_ADS_ENABLED: 'true',
        EXPO_PUBLIC_ADS_TEST_MODE: flag,
        EXPO_PUBLIC_ADMOB_IOS_BANNER_ID: liveBanner,
        EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL_ID: liveInterstitial,
      },
    });
    const gate = { identity: null, eligible: true, appActive: true, blocked: false };
    const controller = createAdsController({
      runtime: app.runtime,
      config,
      getCurrentGate: () => gate,
    });
    controller.setGate(gate);
    const release = controller.acquirePlacement(() => true);
    await controller.waitUntilIdle();
    assert.equal(config.enabled, false);
    assert.equal(app.loads(), 0);
    assert.deepEqual(app.calls, []);
    release();
    controller.dispose();
  }
});

test('release never substitutes test inventory for missing, malformed or demo interstitial IDs', () => {
  for (const id of [
    undefined,
    '',
    'not-an-ad-unit',
    'ca-app-pub-3940256099942544/4411468910',
    `${liveInterstitial}\n`,
  ]) {
    const config = createAdsConfig({
      platform: 'ios',
      env: { EXPO_PUBLIC_ADS_ENABLED: 'true', EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL_ID: id },
    });
    assert.equal(config.interstitialEnabled, false, String(id));
    assert.equal(config.interstitialUnitId, null, String(id));
    assert.equal(config.enabled, false, String(id));
  }
  assert.equal(
    createAdsConfig({
      platform: 'ios',
      env: { EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL_ID: liveInterstitial },
    }).interstitialEnabled,
    false,
  );
});

test('native interstitial factory exposes class lifecycle without loading or initializing an ad', () => {
  const app = runtimeFixture();
  assert.equal(app.loads(), 0);
  assert.equal(app.runtime.hasNativeSupport(), true);
  assert.equal(app.loads(), 0, 'Capability detection does not evaluate the package');
  const sdk = app.runtime.getSdk();
  assert.equal(app.runtime.getSdk(), sdk);
  assert.equal(app.loads(), 1);
  assert.deepEqual(app.calls, [], 'Creating the adapter does not request or initialize ads');
  assert.equal(sdk.testInterstitialUnitId, 'demo-interstitial');
  assert.deepEqual(sdk.interstitialEvents, {
    loaded: 'loaded',
    opened: 'opened',
    closed: 'closed',
    error: 'error',
  });
  const requestOptions = { requestNonPersonalizedAdsOnly: true };
  assert.equal(sdk.createInterstitial(liveInterstitial, requestOptions), app.ad);
  assert.deepEqual(app.calls, [{ unitId: liveInterstitial, requestOptions }]);
});

test('missing interstitial capability preserves the existing banner and fails closed for fullscreen', () => {
  for (const overrides of [
    { InterstitialAd: undefined },
    { AdEventType: { LOADED: 'loaded', OPENED: 'opened', ERROR: 'error' } },
  ]) {
    const app = runtimeFixture(overrides);
    const sdk = app.runtime.getSdk();
    assert.equal(typeof sdk.BannerComponent, 'function');
    assert.equal(sdk.createInterstitial, null);
    assert.equal(sdk.interstitialEvents, null);
    assert.deepEqual(app.calls, []);
  }
});

test('an absent interstitial native bridge cannot advertise a working fullscreen factory', () => {
  const app = runtimeFixture({}, false);
  assert.equal(app.runtime.hasNativeSupport(), true);
  assert.equal(app.runtime.hasInterstitialSupport(), false);
  assert.equal(app.loads(), 0);
  const sdk = app.runtime.getSdk();
  assert.equal(sdk.createInterstitial, null);
  assert.equal(sdk.interstitialEvents, null);
  assert.equal(typeof sdk.BannerComponent, 'function');
  assert.deepEqual(app.calls, []);
});
