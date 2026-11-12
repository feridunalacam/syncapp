import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthRecoveryState, recoverySessionIdentity } from '../src/lib/authRecoveryState.js';
import { createAuthSessionStorage } from '../src/lib/authSessionStorage.js';

const accountA = '10101010-1010-4010-8010-101010101010';
const accountB = '20202020-2020-4020-8020-202020202020';
const sessionA = '30303030-3030-4030-8030-303030303030';
const sessionB = '40404040-4040-4040-8040-404040404040';
const key = 'sync.auth.recovery.v1';
const identity = (userId = accountA, sessionId = sessionA) => ({ userId, sessionId });
const session = (userId = accountA, sessionId = sessionA, extra = {}) => ({
  user: { id: userId },
  access_token: `offline.${Buffer.from(
    JSON.stringify({ sub: userId, session_id: sessionId, ...extra }),
  ).toString('base64url')}.signature`,
});
function storage() {
  const data = new Map();
  return {
    data,
    getItem: async (name) => data.get(name) ?? null,
    setItem: async (name, value) => data.set(name, value),
    removeItem: async (name) => data.delete(name),
  };
}
function state(store, options = {}) {
  let current = false;
  const controller = createAuthRecoveryState({
    storage: store,
    onChange: (value) => (current = value),
    ...options,
  });
  return { controller, active: () => current };
}
const flush = async () => {
  for (let index = 0; index < 8; index++) await Promise.resolve();
};

test('unfinished recovery survives recreation through the real secure storage adapter without copying credentials', async () => {
  const native = new Map();
  const secureStore = {
    getItemAsync: async (name) => native.get(name) ?? null,
    setItemAsync: async (name, value) => native.set(name, value),
    deleteItemAsync: async (name) => native.delete(name),
  };
  const firstStore = createAuthSessionStorage(secureStore);
  await firstStore.setItem('sdk-session', 'SDK-owned-credentials');
  const first = state(firstStore);
  await first.controller.observe(session(), 'PASSWORD_RECOVERY');
  await flush();
  assert.equal(first.active(), true);
  assert.deepEqual(JSON.parse(await firstStore.getItem(key)), identity());
  assert.equal(await firstStore.getItem('sdk-session'), 'SDK-owned-credentials');
  first.controller.suspend();
  const second = state(createAuthSessionStorage(secureStore));
  assert.equal(await second.controller.observe(session(), 'INITIAL_SESSION'), true);
  assert.equal(second.active(), true);
});

test('a refreshed access token keeps the same unfinished recovery session', async () => {
  const store = storage();
  store.data.set(key, JSON.stringify(identity()));
  const app = state(store);
  await app.controller.observe(session(), 'INITIAL_SESSION');
  assert.equal(app.active(), true);
  await app.controller.observe(session(accountA, sessionA, { exp: 1234567890 }), 'TOKEN_REFRESHED');
  assert.equal(app.active(), true);
  const recreated = state(store);
  await recreated.controller.observe(session(accountA, sessionA, { exp: 1234569999 }));
  assert.equal(recreated.active(), true);
});

test('the marker cannot carry recovery into another account or a new login session', async () => {
  for (const next of [session(accountB, sessionB), session(accountA, sessionB)]) {
    const store = storage();
    store.data.set(key, JSON.stringify(identity()));
    const app = state(store);
    await app.controller.observe(next, 'INITIAL_SESSION');
    await flush();
    assert.equal(app.active(), false);
    assert.equal(store.data.has(key), false);
  }
});

test('completion and sign-out remove persisted recovery and cannot reopen it on refresh', async () => {
  for (const end of ['finish', 'signout']) {
    const store = storage();
    const app = state(store);
    await app.controller.observe(session(), 'PASSWORD_RECOVERY');
    await flush();
    if (end === 'finish') await app.controller.finish(session());
    else await app.controller.observe(null, 'SIGNED_OUT');
    await flush();
    assert.equal(app.active(), false);
    assert.equal(store.data.has(key), false);
    await app.controller.observe(session(), 'TOKEN_REFRESHED');
    assert.equal(app.active(), false);
  }
});

test('late hydration and an old password-update completion cannot replace a newer recovery', async () => {
  const store = storage();
  let release;
  store.getItem = () => new Promise((resolve) => (release = resolve));
  const app = state(store);
  const earlier = app.controller.observe(session(), 'INITIAL_SESSION');
  await flush();
  const newer = session(accountB, sessionB);
  await app.controller.observe(newer, 'PASSWORD_RECOVERY');
  await app.controller.finish(session());
  release(JSON.stringify(identity()));
  await earlier;
  await flush();
  assert.equal(app.active(), true);
  assert.deepEqual(JSON.parse(store.data.get(key)), identity(accountB, sessionB));
});

test('a missing or unavailable local marker cannot block authentication indefinitely', async () => {
  const store = storage();
  store.getItem = () => new Promise(() => {});
  const app = state(store, { restoreTimeoutMs: 5 });
  assert.equal(await app.controller.observe(session(), 'INITIAL_SESSION'), false);
  assert.equal(app.active(), false);
});

test('storage failures do not reject an accepted recovery or its completion', async () => {
  const fail = async () => {
    throw new Error('Offline native storage failure');
  };
  const app = state({ getItem: fail, setItem: fail, removeItem: fail });
  await app.controller.observe(session(), 'INITIAL_SESSION');
  assert.equal(app.active(), false);
  await app.controller.observe(session(), 'PASSWORD_RECOVERY');
  assert.equal(app.active(), true);
  await app.controller.finish(session());
  assert.equal(app.active(), false);
});

test('suspending a provider invalidates a pending read while preserving the persisted marker', async () => {
  const store = storage();
  let release;
  store.getItem = () => new Promise((resolve) => (release = resolve));
  const values = [];
  const controller = createAuthRecoveryState({
    storage: store,
    onChange: (value) => values.push(value),
  });
  const pending = controller.observe(session(), 'INITIAL_SESSION');
  await flush();
  controller.suspend();
  release(JSON.stringify(identity()));
  await pending;
  assert.deepEqual(values, [false], 'Unmounted state is never republished');
});

test('binding reads only valid matching identities and supports Unicode without browser decoder globals', () => {
  assert.deepEqual(
    recoverySessionIdentity(session(accountA, sessionA, { bio: 'İstanbul 🏃 東京' })),
    identity(),
  );
  assert.equal(recoverySessionIdentity({ user: { id: accountA }, access_token: 'invalid' }), null);
  assert.equal(recoverySessionIdentity(session(accountA, 'invalid')), null);
  assert.equal(recoverySessionIdentity({ ...session(), user: { id: accountB } }), null);
  assert.equal(recoverySessionIdentity(null), null);
});

test('malformed saved state fails closed and is removed without surfacing private values', async () => {
  const store = storage();
  store.data.set(key, '{broken-marker');
  const app = state(store);
  await app.controller.observe(session(), 'INITIAL_SESSION');
  await flush();
  assert.equal(app.active(), false);
  assert.equal(store.data.has(key), false);
});
