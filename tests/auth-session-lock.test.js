import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createRequire } from 'node:module';
import { createAuthCredentialWriters } from '../src/lib/authCredentialWrites.js';

const require = createRequire(import.meta.url);
const { GoTrueClient, processLock } = require('@supabase/supabase-js');
const project = 'https://offline-test.invalid';

// Load the real app configuration with native imports replaced. The race tests
// consume its lock option, so a missing client wiring fails the SDK regression.
function configuredClients() {
  const options = [];
  const source = readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace(/^export /gm, '');
  const context = {
    process: {
      env: {
        EXPO_PUBLIC_SUPABASE_URL: project,
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'offline-fixture',
      },
    },
    Platform: { OS: 'ios' },
    SecureStore: {},
    AsyncStorage: {},
    processLock,
    URL,
    createAuthCredentialWriters,
    createAuthRecoveryStorage: () => ({ storage: {} }),
    createAuthSessionStorage: () => ({}),
    installNativeAuthCrypto: () => true,
    createAuthFetch: (fetcher) => fetcher,
    fetch: async () => assert.fail('Unexpected transport'),
    createClient(_url, _key, configuration) {
      const index = options.length;
      options.push(configuration);
      return {
        auth: {
          initialize: async () => index,
          resetPasswordForEmail: async () => index,
          exchangeCodeForSession: async () => index,
          signOut: () => assert.fail('must stay private'),
          startAutoRefresh: () => assert.fail('must stay private'),
        },
      };
    },
  };
  new Script(source + '\nglobalThis.recoveryFacade = authRecoveryClient;').runInNewContext(context);
  return { options, facade: context.recoveryFacade };
}
const configuredLock = () => configuredClients().options[0].auth.lock;

test('recovery SDK is sessionless, isolated and exposes no session writer or refresh control', async () => {
  const { options, facade } = configuredClients();
  assert.equal(options.length, 2);
  const [main, recovery] = options;
  assert.equal(main.auth.lock, processLock);
  assert.equal(recovery.auth.lock, undefined);
  assert.equal(recovery.auth.autoRefreshToken, false);
  assert.equal(recovery.auth.persistSession, true);
  assert.equal(recovery.auth.detectSessionInUrl, false);
  assert.equal(recovery.auth.flowType, 'pkce');
  assert.notEqual(recovery.auth.storageKey, main.auth.storageKey);
  assert.notEqual(recovery.auth.storage, main.auth.storage);
  assert.deepEqual(Object.keys(facade).sort(), [
    'exchangeCodeForSession',
    'initialize',
    'resetPasswordForEmail',
  ]);
  assert.equal(await facade.initialize(), 1);
  assert.equal(await facade.resetPasswordForEmail(), 1);
  assert.equal(await facade.exchangeCodeForSession(), 1);
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
};
for (const refreshMethod of ['refreshSession', 'getSession', '_autoRefreshTokenTick']) {
  test(`password update and SDK ${refreshMethod} cannot overwrite rotated session tokens`, async () => {
    const actualNow = Date.now;
    let now = actualNow();
    Date.now = () => now;
    const user = { id: '11111111-1111-4111-8111-111111111111', email: 'offline@example.test' };
    const stored = {
      access_token: 'original-fixture',
      refresh_token: 'original-refresh-fixture',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(now / 1000) + 3600,
      user,
    };
    const key = `offline-sdk-lock-${refreshMethod}`;
    const values = new Map([[key, JSON.stringify(stored)]]);
    const reached = deferred();
    const finishUpdate = deferred();
    let refreshRequests = 0;
    const response = (data) =>
      new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' },
      });
    try {
      const auth = new GoTrueClient({
        url: `${project}/auth/v1`,
        storageKey: key,
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        lock: configuredLock(),
        storage: {
          getItem: async (name) => values.get(name) ?? null,
          setItem: async (name, value) => values.set(name, value),
          removeItem: async (name) => values.delete(name),
        },
        fetch: async (url, options) => {
          if (options.method === 'PUT') {
            reached.resolve();
            await finishUpdate.promise;
            return response({ user: { ...user, updated_at: 'offline-update-fixture' } });
          }
          assert.match(String(url), /grant_type=refresh_token/);
          refreshRequests++;
          return response({
            ...stored,
            access_token: 'rotated-fixture',
            refresh_token: 'rotated-refresh-fixture',
            expires_at: Math.floor(now / 1000) + 3600,
          });
        },
      });
      await auth.initialize();
      const updating = auth.updateUser({ password: 'offline-password-fixture' });
      await reached.promise;
      // The update captured a valid session; the later SDK tick/read now sees
      // it near expiry, as can happen while a slow password request is pending.
      if (refreshMethod !== 'refreshSession') now += 3550000;
      const refreshing = auth[refreshMethod]();
      await new Promise(setImmediate);
      const overlapped = refreshRequests > 0;
      finishUpdate.resolve();
      await Promise.all([updating, refreshing]);
      const saved = JSON.parse(values.get(key));
      assert.equal(overlapped, false, 'refresh must wait for the password update session save');
      assert.equal(saved.access_token, 'rotated-fixture');
      assert.equal(saved.refresh_token, 'rotated-refresh-fixture');
      assert.equal(refreshRequests, 1);
    } finally {
      finishUpdate.resolve();
      Date.now = actualNow;
    }
  });
}
