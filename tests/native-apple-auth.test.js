import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createHash } from 'node:crypto';

const source = readFileSync(new URL('../src/services/auth/apple.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace(/^export /gm, '');
function harness({
  available = true,
  present = true,
  os = 'ios',
  fail = null,
  mismatch = false,
} = {}) {
  let request,
    prompts = 0;
  const scope = {
    Platform: { OS: os },
    requireOptionalNativeModule: () => (present ? {} : null),
    Crypto: {
      getRandomBytes: () => Uint8Array.from({ length: 32 }, (_, i) => i),
      randomUUID: () => 'synthetic-state',
      CryptoDigestAlgorithm: { SHA256: 'SHA256' },
      digestStringAsync: async (_algorithm, input) =>
        createHash('sha256').update(input).digest('hex'),
    },
    require: () => ({
      AppleAuthenticationScope: { EMAIL: 0 },
      isAvailableAsync: async () => available,
      signInAsync: async (options) => {
        prompts++;
        request = options;
        if (fail) throw fail;
        return {
          identityToken: 'synthetic-identity-token',
          state: mismatch ? 'other-state' : options.state,
        };
      },
    }),
  };
  new Script(`${source}\nglobalThis.signIn = signInNativeApple;`).runInNewContext(scope);
  return { signIn: scope.signIn, request: () => request, prompts: () => prompts };
}

test('Apple native sign-in binds a fresh SHA-256 nonce and state and returns the raw nonce for verification', async () => {
  const h = harness();
  const credential = await h.signIn();
  assert.equal(credential.token, 'synthetic-identity-token');
  assert.equal(credential.nonce.length, 64);
  assert.equal(h.request().nonce, createHash('sha256').update(credential.nonce).digest('hex'));
  assert.equal(h.request().state, 'synthetic-state');
  assert.equal(h.request().requestedScopes.length, 1);
});

test('an older binary, unavailable device or non-iOS platform does not start native Apple authentication', async () => {
  for (const options of [{ present: false }, { available: false }, { os: 'android' }]) {
    const h = harness(options);
    assert.equal(await h.signIn(), null);
    assert.equal(h.prompts(), 0);
  }
});

test('native Apple cancellation is a silent result and response state mismatches are rejected', async () => {
  const cancelled = harness({ fail: { code: 'ERR_REQUEST_CANCELED' } });
  assert.equal((await cancelled.signIn()).cancelled, true);
  const mismatch = harness({ mismatch: true });
  await assert.rejects(mismatch.signIn(), /could not be completed/);
});

test('native Apple errors cannot disclose the native credential response', async () => {
  const h = harness({ fail: new Error('sensitive-provider-response') });
  await assert.rejects(
    h.signIn(),
    (error) => !error.message.includes('sensitive-provider-response'),
  );
});
