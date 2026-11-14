import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const nativeOptions = require('../config/admob.cjs');
const { compileModsAsync } = require('@expo/config-plugins');
const installedPlugin = require('react-native-google-mobile-ads/app.plugin');
const withAds = installedPlugin.default || installedPlugin;

test('native ads measurement is delayed and development has valid demo app IDs', () => {
  const config = nativeOptions();
  assert.equal(config.delayAppMeasurementInit, true);
  assert.equal(config.optimizeInitialization, true);
  assert.equal(config.optimizeAdLoading, true);
  assert.match(config.iosAppId, /^ca-app-pub-3940256099942544~\d{10}$/);
  assert.match(config.androidAppId, /^ca-app-pub-3940256099942544~\d{10}$/);
  assert.ok(config.skAdNetworkItems.includes('cstr6suwn9.skadnetwork'));
  assert.equal(new Set(config.skAdNetworkItems).size, config.skAdNetworkItems.length);
  assert.equal(config.skAdNetworkItems.length, 50);
});

test('installed RNAds plugin writes the ATT purpose while retaining native IDs, delayed measurement and all SKAdNetworks', async () => {
  for (const EAS_BUILD_PROFILE of ['development', 'preview', 'production']) {
    const options = nativeOptions({ EAS_BUILD_PROFILE, EXPO_PUBLIC_ADS_ENABLED: 'false' });
    const projectRoot = mkdtempSync(join(tmpdir(), 'sync-admob-plugin-test-'));
    try {
      const generated = await compileModsAsync(
        withAds(
          {
            name: 'Sync',
            slug: 'syncapp',
            _internal: { projectRoot },
            ios: {
              bundleIdentifier: 'com.feridun.syncapp',
              infoPlist: {
                SyncTestMarker: 'retained',
                SKAdNetworkItems: [{ SKAdNetworkIdentifier: options.skAdNetworkItems[0] }],
              },
            },
          },
          options,
        ),
        { projectRoot, platforms: ['ios'], introspect: true, ignoreExistingNativeFiles: true },
      );
      const plist = generated.ios.infoPlist;
      assert.equal(
        plist.NSUserTrackingUsageDescription,
        'Your device’s advertising identifier helps Google measure ad performance and limit repeated ads in Sync.',
      );
      assert.equal(plist.GADApplicationIdentifier, options.iosAppId);
      assert.equal(plist.GADDelayAppMeasurementInit, true);
      assert.equal(plist.SyncTestMarker, 'retained');
      assert.equal(plist.SKAdNetworkItems.length, 50);
      assert.deepEqual(
        plist.SKAdNetworkItems.map((item) => item.SKAdNetworkIdentifier).sort(),
        [...options.skAdNetworkItems].sort(),
      );
      assert.deepEqual(
        readdirSync(projectRoot),
        [],
        'introspection must not write a native project',
      );
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  }
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
