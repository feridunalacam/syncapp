import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomFillSync } from 'node:crypto';
import { createRequire } from 'node:module';
import { installNativeAuthCrypto } from '../src/lib/authCrypto.js';

const require = createRequire(import.meta.url);
const { GoTrueClient } = require('@supabase/auth-js');
const nativeCrypto = {
  getRandomValues: (array) => randomFillSync(array),
  digest: async (algorithm, bytes) => {
    assert.equal(algorithm, 'SHA-256');
    const result = createHash('sha256').update(bytes).digest();
    return result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength);
  },
};
const targetRuntime = (crypto) => ({ TextEncoder, btoa, ...(crypto ? { crypto } : {}) });
const install = (target, native = nativeCrypto) =>
  installNativeAuthCrypto({
    platform: 'ios',
    target,
    loadNativeCrypto: () => native,
  });

test('native SHA-256 matches the RFC7636 S256 challenge vector', async () => {
  const target = targetRuntime();
  assert.equal(install(target), true);
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const digest = await target.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  assert.equal(
    Buffer.from(digest).toString('base64url'),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  );
});

test('digest respects buffer view offsets and does not hash neighboring bytes', async () => {
  const target = targetRuntime();
  install(target);
  const padded = new Uint8Array([255, 97, 98, 99, 255]);
  const digest = await target.crypto.subtle.digest({ name: 'sha-256' }, padded.subarray(1, 4));
  assert.equal(
    Buffer.from(digest).toString('hex'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  await assert.rejects(target.crypto.subtle.digest('SHA-1', padded), /Only SHA-256/);
});

test('working crypto methods and browser globals are never replaced', () => {
  const getRandomValues = () => {};
  const digest = () => {};
  const target = targetRuntime({ getRandomValues, subtle: { digest }, custom: 'kept' });
  assert.equal(
    installNativeAuthCrypto({
      platform: 'ios',
      target,
      loadNativeCrypto: () => assert.fail('No native module needed'),
    }),
    true,
  );
  assert.equal(target.crypto.getRandomValues, getRandomValues);
  assert.equal(target.crypto.subtle.digest, digest);
  assert.equal(target.crypto.custom, 'kept');
  const browser = {};
  assert.equal(
    installNativeAuthCrypto({
      platform: 'web',
      target: browser,
      loadNativeCrypto: () => assert.fail('Never load native code on web'),
    }),
    true,
  );
  assert.equal(Object.hasOwn(browser, 'crypto'), false);
});

test('adding SHA-256 retains an existing secure RNG and subtle methods', () => {
  const getRandomValues = () => {};
  const sign = () => {};
  const target = targetRuntime({ getRandomValues, subtle: { sign } });
  assert.equal(install(target), true);
  assert.equal(target.crypto.getRandomValues, getRandomValues);
  assert.equal(target.crypto.subtle.sign, sign);
  assert.equal(typeof target.crypto.subtle.digest, 'function');
});

test('missing encoders or native capabilities fail closed without crashing or installing a random fallback', () => {
  for (const missing of ['TextEncoder', 'btoa']) {
    const target = targetRuntime();
    delete target[missing];
    assert.equal(install(target), false);
    assert.equal(target.crypto, undefined);
  }
  const target = targetRuntime();
  assert.equal(
    installNativeAuthCrypto({
      platform: 'ios',
      target,
      loadNativeCrypto: () => {
        throw new Error('Native module unavailable');
      },
    }),
    false,
  );
  assert.equal(target.crypto, undefined);
  assert.equal(install(target, {}), false);
  assert.equal(target.crypto, undefined);
});

test('random values use the native provider in place and reject unsupported or oversized inputs', () => {
  const target = targetRuntime();
  let calls = 0;
  install(target, {
    ...nativeCrypto,
    getRandomValues: (array) => {
      calls++;
      array.fill(42);
    },
  });
  const array = new Uint32Array(56);
  assert.equal(target.crypto.getRandomValues(array), array);
  assert.equal(calls, 1);
  assert.ok(array.every((value) => value === 42));
  assert.throws(() => target.crypto.getRandomValues(new Float32Array(4)), /integer typed array/);
  assert.throws(() => target.crypto.getRandomValues(new Uint8Array(65537)), /too large/);
});

test('installed auth-js sends an S256 recovery challenge using the native crypto adapter', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const crypto = {};
  Object.defineProperty(globalThis, 'crypto', { value: crypto, configurable: true });
  let auth;
  try {
    assert.equal(install(globalThis), true);
    const data = new Map();
    let request;
    auth = new GoTrueClient({
      url: 'https://offline-crypto.invalid/auth/v1',
      storageKey: 'crypto-pkce-test',
      flowType: 'pkce',
      experimental: { appendPkceFlowIdToRedirects: true },
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
      storage: {
        getItem: async (key) => data.get(key) ?? null,
        setItem: async (key, value) => {
          data.set(key, value);
        },
        removeItem: async (key) => {
          data.delete(key);
        },
      },
      fetch: async (input, init) => {
        const url = new URL(input);
        assert.equal(url.pathname, '/auth/v1/recover');
        const redirect = new URL(url.searchParams.get('redirect_to'));
        request = { body: JSON.parse(init.body), flowId: redirect.searchParams.get('sb_flow_id') };
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    });
    const result = await auth.resetPasswordForEmail('offline@example.invalid', {
      redirectTo: 'syncapp://auth/recovery',
    });
    assert.equal(result.error, null);
    assert.equal(request.body.code_challenge_method, 's256');
    assert.match(request.flowId, /^[0-9a-f]{32}$/);
    const stored = JSON.parse(data.get(`crypto-pkce-test-flow-${request.flowId}-code-verifier`));
    const verifier = stored.split('/')[0];
    assert.equal(
      request.body.code_challenge,
      createHash('sha256').update(verifier).digest('base64url'),
    );
    assert.notEqual(request.body.code_challenge, verifier);
  } finally {
    auth?.stopAutoRefresh();
    if (previous) Object.defineProperty(globalThis, 'crypto', previous);
    else delete globalThis.crypto;
  }
});
