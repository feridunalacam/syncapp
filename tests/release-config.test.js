import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  checkReleaseConfig,
  resolveProfile,
  runPreflight,
} from '../scripts/check-release-config.mjs';

const values = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://testfixture.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_PublicFixture123',
  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: 'appl_PublicFixture123',
  EXPO_PUBLIC_REVENUECAT_REVIEW_IOS_API_KEY: 'appl_ReviewFixture456',
  EXPO_PUBLIC_PRIVACY_URL: 'https://sync-app-support.feridun.chatgpt.site/privacy',
  EXPO_PUBLIC_TERMS_URL: 'https://sync-app-support.feridun.chatgpt.site/terms',
};
const eas = {
  build: {
    base: { env: { EXPO_PUBLIC_ADS_ENABLED: 'false' } },
    production: { extends: 'base', environment: 'production' },
    preview: { extends: 'base', environment: 'preview' },
    development: { extends: 'base', environment: 'development' },
  },
};

test('local/profile preflight is platform-aware and never claims cloud readiness', () => {
  const result = checkReleaseConfig({ platform: 'ios', env: values, eas });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, ['cloud']);
  assert.ok(
    checkReleaseConfig({ platform: 'android', env: values, eas }).errors.includes('revenuecat'),
  );
});

test('release profiles reject Test Store, private keys and placeholder account config', () => {
  for (const profile of ['preview', 'production']) {
    for (const key of ['test_Release123', 'goog_Wrong123', 'sk_Private123']) {
      assert.ok(
        checkReleaseConfig({
          platform: 'ios',
          profile,
          env: { ...values, EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: key },
          eas,
        }).errors.includes('revenuecat'),
      );
    }
  }
  const missing = checkReleaseConfig({ platform: 'ios', env: {}, eas });
  assert.ok(missing.errors.includes('supabaseUrl'));
  assert.ok(missing.errors.includes('supabaseKey'));
  assert.ok(missing.errors.includes('legal'));
  assert.ok(
    checkReleaseConfig({
      platform: 'ios',
      env: {
        ...values,
        EXPO_PUBLIC_SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_REPLACE_ME',
      },
      eas,
    }).errors.includes('supabaseKey'),
  );
  for (const role of ['anon', 'service_role', 'supabase_admin']) {
    const jwt = [
      'header',
      Buffer.from(JSON.stringify({ role })).toString('base64url'),
      'signature',
    ].join('.');
    const result = checkReleaseConfig({
      platform: 'ios',
      env: { ...values, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt },
      eas,
    });
    assert.equal(result.errors.includes('supabaseKey'), role !== 'anon');
  }
  for (const key of [
    'sb_secret_PrivateFixture123',
    `${values.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY}\n`,
  ]) {
    assert.ok(
      checkReleaseConfig({
        platform: 'ios',
        env: { ...values, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key },
        eas,
      }).errors.includes('supabaseKey'),
    );
  }
});

test('iOS release checks require a distinct real-store review key and never accept test or secret substitutes', () => {
  for (const profile of ['preview', 'production']) {
    for (const key of [
      undefined,
      '',
      'test_ReviewFixture456',
      'sk_PrivateReviewFixture456',
      'goog_ReviewFixture456',
      values.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
      'appl_PLACEHOLDER',
      'appl_YOURKEY',
      'appl_REPLACEME',
      'appl_ReviewFixture456\n',
    ]) {
      const result = checkReleaseConfig({
        platform: 'ios',
        profile,
        eas,
        env: { ...values, EXPO_PUBLIC_REVENUECAT_REVIEW_IOS_API_KEY: key },
      });
      assert.deepEqual(result.errors, ['revenuecatReview']);
    }
    assert.deepEqual(checkReleaseConfig({ platform: 'ios', profile, eas, env: values }).errors, []);
  }
});

test('manual development checks allow an absent review key but validate any supplied review key', () => {
  for (const key of [undefined, '', values.EXPO_PUBLIC_REVENUECAT_REVIEW_IOS_API_KEY]) {
    assert.deepEqual(
      checkReleaseConfig({
        platform: 'ios',
        profile: 'development',
        eas,
        env: { ...values, EXPO_PUBLIC_REVENUECAT_REVIEW_IOS_API_KEY: key },
      }).errors,
      [],
    );
  }
  for (const key of [
    'test_ReviewFixture456',
    'sk_PrivateReviewFixture456',
    values.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
    'appl_PLACEHOLDER',
  ]) {
    assert.deepEqual(
      checkReleaseConfig({
        platform: 'ios',
        profile: 'development',
        eas,
        env: { ...values, EXPO_PUBLIC_REVENUECAT_REVIEW_IOS_API_KEY: key },
      }).errors,
      ['revenuecatReview'],
    );
  }
});

test('Android release checks need only the Android production key, without an iOS review key', () => {
  const android = { ...values, EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: 'goog_PublicFixture123' };
  delete android.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  delete android.EXPO_PUBLIC_REVENUECAT_REVIEW_IOS_API_KEY;
  for (const profile of ['preview', 'production'])
    assert.deepEqual(
      checkReleaseConfig({ platform: 'android', profile, eas, env: android }).errors,
      [],
    );
});

test('profile inheritance is checked and profile overrides win over local env', () => {
  const config = structuredClone(eas);
  config.build.production.env = { EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: 'test_WrongProfile123' };
  assert.ok(
    checkReleaseConfig({ platform: 'ios', env: values, eas: config }).errors.includes('revenuecat'),
  );
  config.build.base.extends = 'production';
  assert.throws(() => resolveProfile(config, 'production'), /circular/);
  assert.deepEqual(checkReleaseConfig({ platform: 'ios', env: values, eas: config }).errors, [
    'inheritance',
  ]);
});

test('enabled release ads require matching real IDs only for the selected platform', () => {
  const config = structuredClone(eas);
  config.build.base.env.EXPO_PUBLIC_ADS_ENABLED = 'true';
  const env = {
    ...values,
    ADMOB_IOS_APP_ID: 'ca-app-pub-1234567890123456~1234567890',
    EXPO_PUBLIC_ADMOB_IOS_BANNER_ID: 'ca-app-pub-1234567890123456/1234567890',
    EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL_ID: 'ca-app-pub-1234567890123456/9876543210',
  };
  assert.deepEqual(checkReleaseConfig({ platform: 'ios', env, eas: config }).errors, []);
  env.EXPO_PUBLIC_ADMOB_IOS_BANNER_ID = 'ca-app-pub-9999999999999999/1234567890';
  assert.ok(checkReleaseConfig({ platform: 'ios', env, eas: config }).errors.includes('adIds'));
  config.build.base.env.EXPO_PUBLIC_ADS_ENABLED = 'TRUE';
  assert.ok(checkReleaseConfig({ platform: 'ios', env, eas: config }).errors.includes('adFlag'));
});

test('release ad preflight rejects absent, demo or foreign interstitial inventory', () => {
  const config = structuredClone(eas);
  config.build.base.env.EXPO_PUBLIC_ADS_ENABLED = 'true';
  const env = {
    ...values,
    ADMOB_IOS_APP_ID: 'ca-app-pub-1234567890123456~1234567890',
    EXPO_PUBLIC_ADMOB_IOS_BANNER_ID: 'ca-app-pub-1234567890123456/1234567890',
  };
  for (const id of [
    undefined,
    'ca-app-pub-3940256099942544/4411468910',
    'ca-app-pub-9999999999999999/9876543210',
    'ca-app-pub-1234567890123456/9876543210\n',
  ]) {
    const result = checkReleaseConfig({
      platform: 'ios',
      env: { ...env, EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL_ID: id },
      eas: config,
    });
    assert.ok(result.errors.includes('adIds'), String(id));
  }
  config.build.base.env.EXPO_PUBLIC_ADS_ENABLED = 'false';
  assert.deepEqual(checkReleaseConfig({ platform: 'ios', env, eas: config }).errors, []);
});

test('preflight output never echoes credential values or untrusted arguments', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-release-preflight-'));
  fs.writeFileSync(path.join(root, 'eas.json'), JSON.stringify(eas));
  const secret = 'sk_NeverEchoThisSecret123';
  const lines = [];
  try {
    assert.equal(
      runPreflight(['--platform', 'ios'], {
        root,
        env: {
          ...values,
          EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: secret,
          EXPO_PUBLIC_REVENUECAT_REVIEW_IOS_API_KEY: `${secret}Review`,
          EXPO_PUBLIC_BAD_SECRET: secret,
        },
        write: (line) => lines.push(line),
      }),
      1,
    );
    assert.equal(
      runPreflight(['--unknown', secret], { root, env: {}, write: (line) => lines.push(line) }),
      1,
    );
    const output = lines.join('\n');
    assert.ok(!output.includes(secret));
    assert.ok(output.includes('distinct App Store public RevenueCat review SDK key'));
    assert.ok(!output.includes(values.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY));
    assert.ok(output.includes('Remote EAS values'));
    assert.ok(output.includes('Private credentials'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
