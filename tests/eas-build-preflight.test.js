import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const hook = path.join(root, 'scripts/eas-build-preflight.mjs');
const baseEnv = { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin` };
const publicValues = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://cloudfixture.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_PublicFixture123',
  EXPO_PUBLIC_PRIVACY_URL: 'https://sync-app-support.feridun.chatgpt.site/privacy',
  EXPO_PUBLIC_TERMS_URL: 'https://sync-app-support.feridun.chatgpt.site/terms',
  EXPO_PUBLIC_ADS_ENABLED: 'false',
};

function releaseEnv(platform = 'ios', profile = 'production') {
  return {
    ...publicValues,
    EAS_BUILD: 'true',
    EAS_BUILD_PLATFORM: platform,
    EAS_BUILD_PROFILE: profile,
    EAS_BUILD_RUNNER: 'eas-build',
    EXPO_PUBLIC_BUILD_PROFILE: profile,
    [platform === 'ios'
      ? 'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY'
      : 'EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY']:
      platform === 'ios' ? 'appl_PublicFixture123' : 'goog_PublicFixture123',
    ...(platform === 'ios'
      ? { EXPO_PUBLIC_REVENUECAT_REVIEW_IOS_API_KEY: 'appl_ReviewFixture456' }
      : {}),
  };
}

function run(env, { cwd = root, npmHook = false } = {}) {
  const result = spawnSync(
    npmHook ? 'npm' : process.execPath,
    npmHook ? ['run', '--silent', 'eas-build-post-install'] : [hook],
    { cwd, env: { ...baseEnv, ...env }, encoding: 'utf8', timeout: 10000 },
  );
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return { status: result.status, output: result.stdout + result.stderr };
}

test('the registered EAS post-install hook runs and checks each actual release platform/profile', () => {
  for (const platform of ['ios', 'android']) {
    for (const profile of ['preview', 'production']) {
      const result = run(releaseEnv(platform, profile), { npmHook: true });
      assert.equal(result.status, 0, result.output);
      assert.match(result.output, /PASS: EAS release environment/);
      assert.match(result.output, /Signing, store approval and live services are separate/);
      assert.doesNotMatch(result.output, /Selected local\/profile/);
    }
  }
  const invalid = run(
    { ...releaseEnv(), EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: 'test_NeverEchoThisSecret123' },
    { npmHook: true },
  );
  assert.equal(invalid.status, 1, invalid.output);
  assert.match(invalid.output, /FAIL:.*RevenueCat/);
  assert.doesNotMatch(invalid.output, /NeverEchoThisSecret123/);
});

test('actual process values cannot be filled or overridden by eas.json or local dotenv files', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-cloud-preflight-'));
  try {
    const configured = releaseEnv();
    fs.writeFileSync(
      path.join(cwd, 'eas.json'),
      JSON.stringify({ build: { production: { environment: 'production', env: configured } } }),
    );
    fs.writeFileSync(
      path.join(cwd, '.env.local'),
      Object.entries(configured)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n'),
    );
    const actual = {
      EAS_BUILD: 'true',
      EAS_BUILD_PLATFORM: 'ios',
      EAS_BUILD_PROFILE: 'production',
      EXPO_PUBLIC_BUILD_PROFILE: 'production',
    };
    const missing = run(actual, { cwd });
    assert.equal(missing.status, 1);
    assert.match(missing.output, /SUPABASE_URL/);
    assert.match(missing.output, /RevenueCat/);
    assert.match(missing.output, /PRIVACY_URL/);
    const missingReview = run(
      { ...configured, EXPO_PUBLIC_REVENUECAT_REVIEW_IOS_API_KEY: undefined },
      { cwd },
    );
    assert.equal(missingReview.status, 1);
    assert.match(missingReview.output, /distinct App Store public RevenueCat review SDK key/);
    const bad = run(
      { ...configured, EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: 'test_ActualInvalid123' },
      { cwd },
    );
    assert.equal(bad.status, 1);
    assert.match(bad.output, /Test Store/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('unknown or incomplete EAS identity fails closed instead of taking the local/development skip', () => {
  for (const change of [
    { EAS_BUILD: undefined },
    { EAS_BUILD: 'false' },
    { EAS_BUILD: 'TRUE' },
    { EAS_BUILD_PLATFORM: undefined },
    { EAS_BUILD_PLATFORM: 'web' },
    { EAS_BUILD_PROFILE: undefined },
    { EAS_BUILD_PROFILE: 'base' },
    { EAS_BUILD_PROFILE: 'production-canary' },
    { EAS_BUILD_PROFILE: 'development-release' },
  ]) {
    const result = run({ ...releaseEnv(), ...change });
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /FAIL: EAS build context/);
    assert.doesNotMatch(result.output, /SKIP:/);
  }
  assert.equal(run({ EAS_BUILD_RUNNER: 'eas-build' }).status, 1);
  assert.equal(run({ EAS_BUILD_ID: 'synthetic-build' }).status, 1);
});

test('the bundled public build profile must match the actual EAS profile exactly', () => {
  for (const profile of ['development', 'preview', 'production']) {
    for (const publicProfile of [
      undefined,
      'unknown',
      `${profile}\n`,
      ...['development', 'preview', 'production'].filter((value) => value !== profile),
    ]) {
      const result = run({
        ...releaseEnv('ios', profile),
        EXPO_PUBLIC_BUILD_PROFILE: publicProfile,
      });
      assert.equal(result.status, 1, result.output);
      assert.match(result.output, /must match EAS_BUILD_PROFILE exactly/);
    }
  }
});

test('development and explicit non-EAS runs preserve a keyless core with clear skip output', () => {
  const development = run({
    EAS_BUILD: 'true',
    EAS_BUILD_PLATFORM: 'ios',
    EAS_BUILD_PROFILE: 'development',
    EXPO_PUBLIC_BUILD_PROFILE: 'development',
  });
  assert.equal(development.status, 0, development.output);
  assert.match(development.output, /SKIP: Development build/);
  const local = run({ EXPO_PUBLIC_BUILD_PROFILE: 'production' }, { npmHook: true });
  assert.equal(local.status, 0, local.output);
  assert.match(local.output, /SKIP: No EAS build context/);
  assert.match(local.output, /manual local\/profile check/);
  assert.doesNotMatch(local.output, /PASS:/);
  const localEas = run({ ...releaseEnv(), EAS_BUILD_RUNNER: 'local-build-plugin' });
  assert.equal(localEas.status, 0, localEas.output);
  assert.match(localEas.output, /PASS:/);
});

test('both release profiles reject missing, private, Test Store, wrong-platform and placeholder keys', () => {
  for (const platform of ['ios', 'android']) {
    const keyName = `EXPO_PUBLIC_REVENUECAT_${platform === 'ios' ? 'IOS' : 'ANDROID'}_API_KEY`;
    const prefix = platform === 'ios' ? 'appl' : 'goog';
    for (const profile of ['preview', 'production']) {
      for (const key of [
        undefined,
        '',
        'sk_NeverEchoThisSecret123',
        'test_NeverEchoThisSecret123',
        platform === 'ios' ? 'goog_NeverEchoThisSecret123' : 'appl_NeverEchoThisSecret123',
        `${prefix}_PLACEHOLDER`,
        `${prefix}_YOURKEY`,
        `${prefix}_PublicFixture123\n`,
      ]) {
        const result = run({ ...releaseEnv(platform, profile), [keyName]: key });
        assert.equal(result.status, 1, result.output);
        assert.match(result.output, /RevenueCat/);
        if (key) assert.ok(!result.output.includes(key));
      }
    }
  }
});

test('registered iOS release hook fails for absent, shared, Test Store, private or placeholder review keys', () => {
  for (const profile of ['preview', 'production']) {
    for (const key of [
      undefined,
      '',
      'test_NeverEchoReview456',
      'sk_NeverEchoReview456',
      'goog_NeverEchoReview456',
      'appl_PublicFixture123',
      'appl_PLACEHOLDER',
      'appl_YOURKEY',
      'appl_REPLACEME',
      'appl_NeverEchoReview456\n',
    ]) {
      const result = run(
        { ...releaseEnv('ios', profile), EXPO_PUBLIC_REVENUECAT_REVIEW_IOS_API_KEY: key },
        { npmHook: true },
      );
      assert.equal(result.status, 1, result.output);
      assert.match(result.output, /distinct App Store public RevenueCat review SDK key/);
      assert.doesNotMatch(result.output, /NeverEchoReview456/);
      if (key) assert.ok(!result.output.includes(key));
    }
  }
});

test('review-key requirement does not affect Android release hooks or keyless development skip', () => {
  for (const profile of ['preview', 'production']) {
    const android = releaseEnv('android', profile);
    assert.equal(android.EXPO_PUBLIC_REVENUECAT_REVIEW_IOS_API_KEY, undefined);
    assert.equal(run(android).status, 0);
  }
  const development = run({
    EAS_BUILD: 'true',
    EAS_BUILD_PLATFORM: 'ios',
    EAS_BUILD_PROFILE: 'development',
    EXPO_PUBLIC_BUILD_PROFILE: 'development',
  });
  assert.equal(development.status, 0);
  assert.match(development.output, /SKIP: Development build/);
});

test('release backend/legal/public-secret checks reject actual unsafe values without echoing them', () => {
  const serviceRoleJwt = [
    'header',
    Buffer.from('{"role":"service_role"}').toString('base64url'),
    'signature',
  ].join('.');
  for (const change of [
    { EXPO_PUBLIC_SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co' },
    { EXPO_PUBLIC_SUPABASE_URL: 'https://PLACEHOLDER.supabase.co' },
    { EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_REPLACE_ME' },
    { EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_NeverEchoThisSecret123' },
    { EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: serviceRoleJwt },
    { EXPO_PUBLIC_PRIVACY_URL: 'http://private.invalid/NeverEchoThisSecret123' },
    { EXPO_PUBLIC_TERMS_URL: undefined },
    { EXPO_PUBLIC_SERVICE_ROLE_KEY: 'NeverEchoThisSecret123' },
  ]) {
    const result = run({ ...releaseEnv(), ...change });
    assert.equal(result.status, 1, result.output);
    for (const value of Object.values(change)) {
      if (value) assert.ok(!result.output.includes(value));
    }
    assert.doesNotMatch(result.output, /NeverEchoThisSecret123/);
  }
  const untrusted = run({ ...releaseEnv(), EAS_BUILD_PROFILE: 'NeverEchoThisSecret123' });
  assert.equal(untrusted.status, 1);
  assert.doesNotMatch(untrusted.output, /NeverEchoThisSecret123/);
});

test('enabled release ads use actual matching inventory for the selected build platform', () => {
  for (const platform of ['ios', 'android']) {
    const suffix = platform === 'ios' ? 'IOS' : 'ANDROID';
    const env = {
      ...releaseEnv(platform),
      EXPO_PUBLIC_ADS_ENABLED: 'true',
      [`ADMOB_${suffix}_APP_ID`]: 'ca-app-pub-1234567890123456~1234567890',
      [`EXPO_PUBLIC_ADMOB_${suffix}_BANNER_ID`]: 'ca-app-pub-1234567890123456/1234567890',
      [`EXPO_PUBLIC_ADMOB_${suffix}_INTERSTITIAL_ID`]: 'ca-app-pub-1234567890123456/9876543210',
    };
    const valid = run(env);
    assert.equal(valid.status, 0, valid.output);
    const missing = run({ ...env, [`EXPO_PUBLIC_ADMOB_${suffix}_INTERSTITIAL_ID`]: undefined });
    assert.equal(missing.status, 1, missing.output);
    assert.match(missing.output, /Enabled release ads/);
    const demo = run({
      ...env,
      [`ADMOB_${suffix}_APP_ID`]: 'ca-app-pub-3940256099942544~1234567890',
    });
    assert.equal(demo.status, 1, demo.output);
    const invalidFlag = run({ ...env, EXPO_PUBLIC_ADS_ENABLED: 'TRUE' });
    assert.equal(invalidFlag.status, 1, invalidFlag.output);
    assert.match(invalidFlag.output, /exactly true or false/);
  }
});
