import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSubscriptionConfig,
  loadSubscriptionSdk,
} from '../src/services/subscriptions/config.js';
import { createSubscriptionController } from '../src/services/subscriptions/controller.js';

const env = (ios, android) => ({
  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: ios,
  EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: android,
});

test('store keys are selected per platform and unsupported platforms stay disabled', () => {
  const values = env('appl_PublicIos123', 'goog_PublicAndroid123');
  assert.equal(
    createSubscriptionConfig({ platform: 'ios', env: values }).apiKey,
    values.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
  );
  assert.equal(
    createSubscriptionConfig({ platform: 'android', env: values }).apiKey,
    values.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
  );
  assert.equal(createSubscriptionConfig({ platform: 'web', env: values }).enabled, false);
});

test('Test Store requires a debug build outside explicit preview and production profiles', () => {
  for (const platform of ['ios', 'android']) {
    const values = env('test_ExplicitDebug123', 'test_ExplicitDebug456');
    assert.equal(
      createSubscriptionConfig({ platform, env: values, dev: true, profile: 'development' })
        .testMode,
      true,
    );
    for (const profile of [undefined, 'development', 'preview', 'production']) {
      assert.equal(
        createSubscriptionConfig({ platform, env: values, dev: false, profile }).enabled,
        false,
      );
    }
    for (const profile of ['preview', 'production']) {
      assert.equal(
        createSubscriptionConfig({ platform, env: values, dev: true, profile }).enabled,
        false,
      );
    }
  }
});

test('missing, private, malformed and wrong-platform keys never reach the native SDK', async () => {
  for (const [platform, key] of [
    ['ios', 'test_NotForRelease123'],
    ['ios', 'goog_WrongPlatform123'],
    ['android', 'appl_WrongPlatform123'],
    ['ios', 'sk_Private123'],
    ['android', 'sk_Private456'],
    ['ios', ' appl_ExtraSpace123'],
    ['ios', 'appl_ExtraNewline123\n'],
    ['ios', 'appl_'],
    ['ios', 'appl_REPLACE_ME'],
    ['android', undefined],
  ]) {
    let loads = 0;
    const config = createSubscriptionConfig({
      platform,
      profile: 'production',
      env: env(key, key),
    });
    const sdk = loadSubscriptionSdk(config, {
      hasNativeModule: true,
      load: () => {
        loads++;
        assert.fail('Rejected keys must not load native purchases.');
      },
    });
    assert.equal(config.apiKey, null);
    assert.equal(sdk, null);
    const controller = createSubscriptionController({
      sdk,
      apiKey: config.apiKey,
      verify: async () => ({ entitlement: null }),
    });
    await controller.identify('test-user');
    assert.equal(controller.getState().configured, false);
    assert.equal(controller.getState().ready, true);
    assert.throws(() => controller.purchase({}), /not available/);
    assert.equal(loads, 0);
    controller.dispose();
  }
});

test('valid config still requires a native bridge and handles an old binary safely', () => {
  const config = createSubscriptionConfig({ platform: 'ios', env: env('appl_Public123') });
  const sdk = {};
  assert.equal(loadSubscriptionSdk(config, { hasNativeModule: true, load: () => sdk }), sdk);
  assert.equal(
    loadSubscriptionSdk(config, { hasNativeModule: false, load: () => assert.fail() }),
    null,
  );
  assert.equal(
    loadSubscriptionSdk(config, {
      hasNativeModule: true,
      load: () => {
        throw new Error('Old binary');
      },
    }),
    null,
  );
});
