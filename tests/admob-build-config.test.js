import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nativeOptions = require('../config/admob.cjs');

test('native ads measurement is delayed and development has valid demo app IDs', () => {
  const config = nativeOptions();
  assert.equal(config.delayAppMeasurementInit, true);
  assert.match(config.iosAppId, /^ca-app-pub-3940256099942544~\d{10}$/);
  assert.match(config.androidAppId, /^ca-app-pub-3940256099942544~\d{10}$/);
  assert.ok(config.skAdNetworkItems.includes('cstr6suwn9.skadnetwork'));
  assert.equal(new Set(config.skAdNetworkItems).size, config.skAdNetworkItems.length);
  assert.equal('userTrackingUsageDescription' in config, false);
});

test('live release refuses demo or invalid app IDs before native prebuild', () => {
  for (const EAS_BUILD_PROFILE of ['preview', 'production']) {
    assert.throws(
      () => nativeOptions({ EAS_BUILD_PROFILE, EXPO_PUBLIC_ADS_ENABLED: 'true' }),
      /real iOS and Android/,
    );
  }
  assert.throws(() => nativeOptions({ ADMOB_IOS_APP_ID: 'invalid' }), /Invalid AdMob/);
  const env = {
    EAS_BUILD_PROFILE: 'production',
    EXPO_PUBLIC_ADS_ENABLED: 'true',
    ADMOB_IOS_APP_ID: 'ca-app-pub-1234567890123456~1234567890',
    ADMOB_ANDROID_APP_ID: 'ca-app-pub-1234567890123456~0987654321',
  };
  assert.equal(nativeOptions(env).iosAppId, env.ADMOB_IOS_APP_ID);
  assert.equal(nativeOptions(env).androidAppId, env.ADMOB_ANDROID_APP_ID);
});
