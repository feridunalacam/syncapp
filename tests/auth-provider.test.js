import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { createAuthRecoveryState } from '../src/lib/authRecoveryState.js';
import { recoverySessionIdentity } from '../src/lib/authRecoveryState.js';
import { createAuthOperationQueue } from '../src/lib/authOperations.js';
import { createAuthRecoveryFlow } from '../src/lib/authRecoveryFlow.js';
import { createAuthFetch, AUTH_REQUEST_TIMEOUT_MS } from '../src/lib/authFetch.js';
import { AUTH_REDIRECT, RECOVERY_REDIRECT, parseAuthLink } from '../src/lib/authLinks.js';
import { authExchangeDiagnostic, createAuthCodeExchanger } from '../src/lib/authCodeExchange.js';
import { createSocialAuth } from '../src/lib/socialAuth.js';
import { observeAppleCredentialRevocation } from '../src/lib/appleCredentialRevocation.js';
import {
  createAccountStore,
  clearAccountStore,
  discoverAccountNamespaces,
  invalidateAccountStores,
} from '../src/lib/accountStore.js';
import {
  createBillingScopeRegistry,
  invalidateBillingScope,
  getKnownBillingNamespaces,
  forgetBillingScope,
} from '../src/lib/accountBillingScope.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const { FunctionsClient } = require('@supabase/functions-js');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const source = readFileSync(new URL('../src/context/AuthContext.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/gm, '')
  .replace('export const useAuth', 'const useAuth')
  .replace('export function AuthProvider', 'function AuthProvider');
const compiled = transformSync(`${source}\nglobalThis.exports = { AuthProvider, useAuth };`, {
  configFile: false,
  babelrc: false,
  plugins: ['@babel/plugin-transform-react-jsx'],
}).code;
const accountA = '10101010-1010-4010-8010-101010101010';
const accountB = '20202020-2020-4020-8020-202020202020';
const sessionA = '30303030-3030-4030-8030-303030303030';
const sessionB = '40404040-4040-4040-8040-404040404040';
const session = (userId = accountA, sessionId = sessionA) => ({
  user: { id: userId },
  refresh_token: 'offline-refresh',
  access_token: `offline.${Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId })).toString('base64url')}.signature`,
});
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function memoryStorage() {
  const data = new Map();
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => data.set(key, value),
    removeItem: async (key) => data.delete(key),
    getAllKeys: async () => [...data.keys()],
    multiRemove: async (keys) => keys.forEach((key) => data.delete(key)),
  };
}
function nativePlatformStorage(native) {
  const body = readFileSync(new URL('../src/lib/platformStorage.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/gm, '')
    .replace(/^export /gm, '');
  const context = {
    Platform: { OS: 'ios' },
    SecureStore: native,
    storage: { getJSON: async () => ({}), setJSON: async () => true },
    STORAGE_KEYS: { CONNECTED_PLATFORMS: 'connectedPlatforms' },
  };
  new Script(
    `${body}\nglobalThis.result = { clearAccountPlatforms, invalidateAccountPlatforms };`,
  ).runInNewContext(context);
  return context.result;
}
async function harness(options = {}) {
  const initial = deferred();
  let listener, urlListener;
  let value;
  let exchanges = 0;
  const store = options.store || memoryStorage();
  const auth = {
    onAuthStateChange(callback) {
      listener = callback;
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
    getSession: () => initial.promise,
    startAutoRefresh: () => {},
    stopAutoRefresh: () => {},
    exchangeCodeForSession: async () => {
      exchanges++;
      const next = session();
      listener('PASSWORD_RECOVERY', next);
      return { data: { session: next }, error: null };
    },
    setSession:
      options.setSession ||
      (async () => {
        const next = session();
        listener('SIGNED_IN', next);
        return { data: { session: next, user: next.user }, error: null };
      }),
    updateUser: options.updateUser || (async () => ({ data: {}, error: null })),
    signInWithPassword: options.signInWithPassword || (async () => ({ data: {}, error: null })),
    signUp: options.signUp || (async () => ({ data: { session: null }, error: null })),
    signOut: options.signOut || (async () => ({ data: {}, error: null })),
  };
  const context = {
    React,
    createContext: React.createContext,
    useContext: React.useContext,
    useEffect: React.useEffect,
    useRef: React.useRef,
    useState: React.useState,
    AsyncStorage: options.accountStorage || memoryStorage(),
    clearAccountPlatforms: options.clearAccountPlatforms || (() => {}),
    invalidateAccountPlatforms: options.invalidateAccountPlatforms || (() => {}),
    clearAccountStore,
    discoverAccountNamespaces,
    invalidateAccountStores,
    invalidateBillingScope,
    getKnownBillingNamespaces,
    forgetBillingScope,
    AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
    Linking: {
      getInitialURL: () => Promise.resolve(null),
      addEventListener(_event, callback) {
        urlListener = callback;
        return { remove: () => {} };
      },
    },
    WebBrowser: {},
    supabase: {
      auth,
      functions: { invoke: options.invoke || (() => assert.fail('Unexpected account mutation')) },
    },
    isSupabaseConfigured: true,
    authStorage: store,
    AUTH_REDIRECT,
    RECOVERY_REDIRECT,
    parseAuthLink,
    authExchangeDiagnostic,
    createAuthCodeExchanger,
    createAuthRecoveryState,
    createAuthRecoveryFlow,
    authRecoveryStorage: {
      run: (action) => action(),
      hasFlow: async () => true,
      invalidate: options.invalidateRecovery || (async () => {}),
      suspend: () => {},
    },
    authRecoveryClient: {
      initialize: async () => {},
      resetPasswordForEmail:
        options.resetPasswordForEmail || (async () => ({ data: {}, error: null })),
      exchangeCodeForSession: async () => {
        exchanges++;
        const next = session();
        return { data: { session: next, user: next.user, redirectType: 'recovery' }, error: null };
      },
    },
    recoverySessionIdentity,
    createAuthOperationQueue,
    createSocialAuth,
    AUTH_SERVICE_ORIGIN: 'https://fixture.supabase.co',
    ensureSocialProvider: options.ensureSocialProvider || (async () => {}),
    signInNativeApple: options.signInNativeApple || (async () => null),
    getNativeAppleAuthentication: () => options.nativeApple || null,
    observeAppleCredentialRevocation,
    signInWithNativeIdToken:
      options.signInWithNativeIdToken || (async () => assert.fail('Unexpected native login')),
    authCredentialWriters: {
      signInWithPassword: (credentials) => auth.signInWithPassword(credentials),
      signUp: (credentials) => auth.signUp(credentials),
    },
    __DEV__: false,
  };
  new Script(compiled).runInNewContext(context);
  const { AuthProvider, useAuth } = context.exports;
  function Observer() {
    value = useAuth();
    return null;
  }
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(AuthProvider, {}, React.createElement(Observer)));
  });
  return {
    store,
    initial,
    auth,
    get value() {
      return value;
    },
    exchanges: () => exchanges,
    async emit(event, next) {
      await act(async () => listener(event, next));
    },
    async link(url) {
      await act(async () => urlListener({ url }));
    },
    dispatchLink: (url) => urlListener({ url }),
    dispatchAuth: (event, next) => listener(event, next),
    async close() {
      await act(async () => renderer.unmount());
    },
  };
}

test('native Apple registration uses the verified session bearer and cannot cross an account change', async () => {
  for (const changed of [false, true]) {
    const calls = [];
    const target = session();
    const app = await harness({
      signInNativeApple: async () => ({
        token: 'synthetic-id-token',
        nonce: 'synthetic',
        authorizationCode: 'synthetic-code',
      }),
      signInWithNativeIdToken: async () => {
        app.dispatchAuth('SIGNED_IN', changed ? session(accountB, sessionB) : target);
        return { data: { session: target }, error: null };
      },
      invoke: async (name, options) => {
        calls.push([name, options]);
        return { error: null };
      },
    });
    try {
      await act(async () => {
        await app.value.signInWithOAuth('apple');
      });
      assert.equal(app.value.user.id, changed ? accountB : accountA);
      assert.equal(calls.length, changed ? 0 : 1);
      if (!changed) {
        assert.equal(calls[0][0], 'register-apple-token');
        assert.equal(calls[0][1].body.authorization_code, 'synthetic-code');
        assert.deepEqual(Object.keys(calls[0][1].body), ['authorization_code']);
        assert.equal(calls[0][1].headers.Authorization, `Bearer ${target.access_token}`);
      }
    } finally {
      await app.close();
    }
  }
});

test('cold session restoration holds the ready gate until the session-bound recovery marker is read', async () => {
  const marker = deferred();
  const store = memoryStorage();
  store.getItem = () => marker.promise;
  const app = await harness({ store });
  try {
    await act(async () => app.initial.resolve({ data: { session: session() }, error: null }));
    assert.equal(app.value.ready, false);
    assert.equal(app.value.recoveryMode, false);
    await act(async () =>
      marker.resolve(JSON.stringify({ userId: accountA, sessionId: sessionA })),
    );
    assert.equal(app.value.ready, true);
    assert.equal(app.value.recoveryMode, true);
    assert.equal(app.value.user.id, accountA);
  } finally {
    await app.close();
  }
});

test('a stale initial getSession rejection cannot overwrite a later successful auth event', async () => {
  const app = await harness();
  try {
    await app.emit('SIGNED_IN', session());
    assert.equal(app.value.ready, true);
    await act(async () => app.initial.reject(new Error('Old bootstrap request failed')));
    assert.equal(app.value.error, null);
    assert.equal(app.value.user.id, accountA);
  } finally {
    await app.close();
  }
});

test('duplicate delivery after dismissing recovery shares the exchange without reopening the form', async () => {
  const app = await harness();
  const link = `${RECOVERY_REDIRECT}?code=offline-code&sb_flow_id=${'a'.repeat(32)}`;
  try {
    await app.link(link);
    assert.equal(app.value.recoveryMode, true);
    await act(async () => app.value.dismissRecovery());
    assert.equal(app.value.recoveryMode, false);
    await app.link(link);
    assert.equal(app.exchanges(), 1);
    assert.equal(app.value.recoveryMode, false);
  } finally {
    await app.close();
  }
});

test('a password update from an earlier account cannot dismiss a newer account recovery', async () => {
  const update = deferred();
  const app = await harness({ updateUser: () => update.promise });
  try {
    await app.emit('PASSWORD_RECOVERY', session());
    let completing;
    await act(async () => {
      completing = app.value.updatePassword('offline-new-password');
    });
    await app.emit('PASSWORD_RECOVERY', session(accountB, sessionB));
    await act(async () => {
      update.resolve({ data: {}, error: null });
      await completing;
    });
    assert.equal(app.value.user.id, accountB);
    assert.equal(app.value.recoveryMode, true);
  } finally {
    await app.close();
  }
});

test('an incoming recovery waits for an older password update to finish before replacing its session', async () => {
  const update = deferred();
  const app = await harness({ updateUser: () => update.promise });
  try {
    await app.emit('PASSWORD_RECOVERY', session(accountB, sessionB));
    let completing, receiving;
    await act(async () => {
      completing = app.value.updatePassword('offline-new-password');
      receiving = app.dispatchLink(
        `${RECOVERY_REDIRECT}?code=next-recovery&sb_flow_id=${'b'.repeat(32)}`,
      );
    });
    assert.equal(app.exchanges(), 0);
    await act(async () => {
      update.resolve({ data: {}, error: null });
      await completing;
      await receiving;
    });
    assert.equal(app.exchanges(), 1);
    assert.equal(app.value.user.id, accountA);
    assert.equal(app.value.recoveryMode, true);
  } finally {
    await app.close();
  }
});

test('a queued account-bound action cannot sign out a newer accepted session', async () => {
  const login = deferred();
  let signOuts = 0;
  const app = await harness({
    signInWithPassword: () => login.promise,
    signOut: async () => {
      signOuts++;
      return { error: null };
    },
  });
  try {
    await app.emit('SIGNED_IN', session());
    let signingIn, signingOut;
    await act(async () => {
      signingIn = app.value.signIn('offline@example.test', 'offline-password');
      signingOut = app.value.signOut();
    });
    const rejected = assert.rejects(signingOut, /account changed/);
    await app.emit('SIGNED_IN', session(accountB, sessionB));
    await act(async () => {
      login.resolve({ data: {}, error: null });
      await signingIn;
      await rejected;
    });
    assert.equal(signOuts, 0);
    assert.equal(app.value.user.id, accountB);
  } finally {
    await app.close();
  }
});

test('unreachable account services settle initial readiness and show a friendly explicit-action error', async () => {
  const app = await harness({
    signInWithPassword: async () => ({
      data: {},
      error: { name: 'AuthRetryableFetchError', message: 'Offline transport fixture' },
    }),
  });
  try {
    await act(async () =>
      app.initial.resolve({ data: { session: null }, error: { name: 'AuthRetryableFetchError' } }),
    );
    assert.equal(app.value.ready, true);
    assert.equal(app.value.user, null);
    assert.match(app.value.error, /could not reconnect/);
    await act(async () => {
      await assert.rejects(
        app.value.signIn('offline@example.test', 'offline-fixture'),
        /Check your connection and retry/,
      );
    });
  } finally {
    await app.close();
  }
});

test('queued deletion is bound to the confirmed session even when the account UUID is unchanged', async () => {
  const pending = deferred();
  let deletions = 0;
  const app = await harness({
    signInWithPassword: () => pending.promise,
    invoke: () => {
      deletions++;
      return { error: null };
    },
  });
  try {
    await app.emit('SIGNED_IN', session());
    let signingIn, deleting;
    await act(async () => {
      signingIn = app.value.signIn('offline@example.test', 'offline-fixture');
      deleting = app.value.deleteAccount();
    });
    const rejected = assert.rejects(deleting, /account changed/);
    await app.emit('SIGNED_IN', session(accountA, sessionB));
    await act(async () => {
      pending.resolve({ data: {}, error: null });
      await signingIn;
      await rejected;
    });
    assert.equal(deletions, 0);
    assert.equal(app.value.user.id, accountA);
  } finally {
    await app.close();
  }
});

test('held deletion success and error bodies abort before queued sign-out/sign-in, without claiming deletion', async () => {
  for (const status of [200, 503]) {
    let expire,
      calls = 0,
      signOuts = 0,
      localCleanups = 0,
      clears = 0;
    const reached = deferred();
    const target = session();
    const project = 'https://offline-test.invalid';
    const functions = new FunctionsClient(`${project}/functions/v1`, {
      customFetch: createAuthFetch(
        async (input, options) => {
          calls++;
          assert.equal(input, `${project}/functions/v1/delete-account`);
          assert.equal(options.headers.Authorization, `Bearer ${target.access_token}`);
          return {
            status,
            statusText: 'Offline fixture',
            headers: new Headers({ 'Content-Type': 'application/json' }),
            text: () => {
              reached.resolve();
              return new Promise((_resolve, reject) =>
                options.signal.addEventListener('abort', () =>
                  reject(new Error('Native deletion request cancelled fixture')),
                ),
              );
            },
          };
        },
        project,
        {
          setTimer(callback, delay) {
            expire = callback;
            assert.equal(delay, AUTH_REQUEST_TIMEOUT_MS);
            return 1;
          },
          clearTimer() {
            clears++;
          },
        },
      ),
    });
    let app;
    app = await harness({
      invoke: functions.invoke.bind(functions),
      clearAccountPlatforms: () => {
        localCleanups++;
      },
      signOut: async () => {
        signOuts++;
        app.dispatchAuth('SIGNED_OUT', null);
        return { error: null };
      },
      signInWithPassword: async () => {
        app.dispatchAuth('SIGNED_IN', session(accountB, sessionB));
        return { data: { user: { id: accountB } }, error: null };
      },
    });
    try {
      await app.emit('SIGNED_IN', target);
      let deleting, signingOut, signingIn;
      await act(async () => {
        deleting = app.value.deleteAccount();
      });
      await reached.promise;
      const rejected = assert.rejects(deleting, /deletion could not be confirmed/);
      await act(async () => {
        signingOut = app.value.signOut();
        signingIn = app.value.signIn('offline-b@example.test', 'offline-fixture');
      });
      assert.equal(signOuts, 0);
      await act(async () => {
        expire();
        await Promise.all([rejected, signingOut, signingIn]);
      });
      assert.equal(calls, 1);
      assert.equal(clears, 1);
      assert.equal(signOuts, 1);
      assert.equal(localCleanups, 0);
      assert.equal(app.value.user.id, accountB);
    } finally {
      await app.close();
    }
  }
});

test('confirmed deletion cleans only the target account known namespaces and preserves a newer identity and guest data', async () => {
  const local = memoryStorage();
  const registry = createBillingScopeRegistry(local);
  const reviewNamespace = `review:1:${accountA}`;
  await registry.confirm({
    user_id: accountA,
    lane: 'review',
    namespace: reviewNamespace,
    epoch: 1,
    active: true,
    expires_at: '2099-01-01T00:00:00.000Z',
  });
  for (const namespace of [accountA, reviewNamespace, `unresolved:${accountA}`]) {
    await createAccountStore(local, accountA, undefined, { namespace }).setString(
      'profileBio',
      namespace,
    );
  }
  await createAccountStore(local, accountB).setString('profileBio', 'Other account remains');
  await createAccountStore(local, null).setString('profileBio', 'Guest remains');
  const pending = deferred();
  const reached = deferred();
  const clearedMusic = [];
  let signOuts = 0;
  const app = await harness({
    accountStorage: local,
    invoke: () => {
      reached.resolve();
      return pending.promise;
    },
    clearAccountPlatforms: async (namespace) => clearedMusic.push(namespace),
    signOut: async () => {
      signOuts++;
      return { error: null };
    },
  });
  try {
    await app.emit('SIGNED_IN', session());
    let deleting;
    await act(async () => {
      deleting = app.value.deleteAccount();
    });
    await reached.promise;
    assert.deepEqual(clearedMusic, []);
    await app.emit('SIGNED_IN', session(accountB, sessionB));
    await act(async () => {
      pending.resolve({ error: null });
      await deleting;
    });
    assert.equal(app.value.user.id, accountB);
    assert.equal(signOuts, 0);
    assert.deepEqual(
      [...clearedMusic].sort(),
      [accountA, reviewNamespace, `unresolved:${accountA}`].sort(),
    );
    assert.equal(
      [...local.data.keys()].some(
        (key) =>
          key.startsWith(`@syncapp/account/${accountA}/`) ||
          key.startsWith(`@syncapp/account/${reviewNamespace}/`) ||
          key.startsWith(`@syncapp/account/unresolved:${accountA}/`),
      ),
      false,
    );
    assert.equal(
      await createAccountStore(local, accountB).getString('profileBio'),
      'Other account remains',
    );
    assert.equal(await createAccountStore(local, null).getString('profileBio'), 'Guest remains');
    assert.deepEqual(await getKnownBillingNamespaces(local, accountA), [`unresolved:${accountA}`]);
    await assert.rejects(
      registry.confirm({
        user_id: accountA,
        lane: 'review',
        namespace: reviewNamespace,
        epoch: 1,
        active: true,
        expires_at: '2099-01-01T00:00:00.000Z',
      }),
      /could not be checked/,
    );
  } finally {
    await app.close();
  }
});

test('confirmed deletion discovers legacy production data without a billing registry', async () => {
  const local = memoryStorage();
  await createAccountStore(local, accountA).setJSON('routines', [{ id: 'legacy-local' }]);
  const app = await harness({ accountStorage: local, invoke: async () => ({ error: null }) });
  try {
    await app.emit('SIGNED_IN', session());
    await act(async () => app.value.deleteAccount());
    assert.equal(app.value.user, null);
    assert.equal(
      [...local.data.keys()].some((key) => key.startsWith(`@syncapp/account/${accountA}/`)),
      false,
    );
  } finally {
    await app.close();
  }
});

test('confirmed deletion closes a legacy writer held before its first durable key without a scope registry', async () => {
  const local = memoryStorage();
  const pending = deferred();
  const reached = deferred();
  const set = local.setItem;
  local.setItem = async (key, value) => {
    if (key === `@syncapp/account/${accountA}/@syncmeta`) {
      reached.resolve();
      await pending.promise;
    }
    return set(key, value);
  };
  const legacy = createAccountStore(local, accountA);
  const saving = legacy.setString('profileBio', 'Held first legacy write');
  await reached.promise;
  assert.equal(local.data.size, 0);
  const app = await harness({ accountStorage: local, invoke: async () => ({ error: null }) });
  try {
    await app.emit('SIGNED_IN', session());
    let deleting;
    await act(async () => {
      deleting = app.value.deleteAccount();
    });
    await act(async () => {
      pending.resolve();
      await Promise.all([saving, deleting]);
    });
    assert.equal(await legacy.setString('profileBio', 'Late resurrection'), false);
    assert.equal(
      [...local.data.keys()].some((key) => key.startsWith(`@syncapp/account/${accountA}/`)),
      false,
    );
  } finally {
    pending.resolve();
    await app.close();
  }
});

test('a confirmed remote deletion retains namespace knowledge and reports incomplete local cleanup', async () => {
  const local = memoryStorage();
  const namespace = `review:1:${accountA}`;
  await createBillingScopeRegistry(local).confirm({
    user_id: accountA,
    lane: 'review',
    namespace,
    epoch: 1,
    active: true,
    expires_at: '2099-01-01T00:00:00.000Z',
  });
  await createAccountStore(local, accountA, undefined, { namespace }).setString(
    'profileBio',
    'Review record',
  );
  const app = await harness({
    accountStorage: local,
    invoke: async () => ({
      data: { deleted: true, apple_revocation: { status: 'manual_required' } },
      error: null,
    }),
    clearAccountPlatforms: async () => {
      throw new Error('Offline native cleanup fixture');
    },
  });
  try {
    await app.emit('SIGNED_IN', session());
    await act(async () =>
      assert.rejects(app.value.deleteAccount(), (error) => {
        assert.match(error.message, /account was deleted, but some device records/);
        assert.equal(error.apple_revocation.status, 'manual_required');
        return true;
      }),
    );
    assert.equal(app.value.user, null);
    assert.ok((await getKnownBillingNamespaces(local, accountA)).includes(namespace));
  } finally {
    await app.close();
  }
});

test('a corrupt or unreadable registry cannot leave live writers open or skip deletion discovery', async () => {
  for (const brokenRead of [false, true]) {
    const local = memoryStorage();
    const registryKey = `@syncapp/billing-scope/${accountA}`;
    local.data.set(registryKey, '{recoverable-registry');
    const pending = deferred();
    const reached = deferred();
    const invalidated = deferred();
    const set = local.setItem;
    const get = local.getItem;
    const keys = local.getAllKeys;
    let keyDiscoveries = 0;
    local.getItem = (key) => {
      if (brokenRead && key === registryKey) throw new Error('Registry read fixture');
      return get(key);
    };
    local.getAllKeys = () => {
      keyDiscoveries++;
      return keys();
    };
    local.setItem = async (key, value) => {
      if (key === `@syncapp/account/${accountA}/@syncmeta`) {
        reached.resolve();
        await pending.promise;
      }
      return set(key, value);
    };
    const legacy = createAccountStore(local, accountA);
    const saving = legacy.setString('profileBio', 'Held first local write');
    await reached.promise;
    const app = await harness({
      accountStorage: local,
      invoke: async () => ({ error: null }),
      invalidateAccountPlatforms: (namespace) => {
        if (namespace === accountA) invalidated.resolve();
      },
    });
    try {
      await app.emit('SIGNED_IN', session());
      let deleting;
      await act(async () => {
        deleting = app.value.deleteAccount();
      });
      await invalidated.promise;
      const rejected = assert.rejects(deleting, /account was deleted, but some device records/);
      const lateWrite = legacy.setString('profileBio', 'Late resurrection');
      await act(async () => {
        pending.resolve();
        await Promise.all([saving, rejected]);
      });
      assert.equal(await lateWrite, false);
      assert.ok(keyDiscoveries > 0);
      assert.equal(
        [...local.data.keys()].some((key) => key.startsWith(`@syncapp/account/${accountA}/`)),
        false,
      );
      assert.equal(local.data.get(registryKey), '{recoverable-registry');
      assert.equal(app.value.user, null);
    } finally {
      pending.resolve();
      await app.close();
    }
  }
});

test('confirmed deletion removes SecureStore-only legacy credentials without registry or account metadata', async () => {
  const credentials = new Map([
    [`syncapp.music.credentials.${accountA}`, 'synthetic-orphan-for-deleted-account'],
    [`syncapp.music.credentials.${accountB}`, 'other-account-remains'],
    ['syncapp.music.credentials', 'guest-remains'],
  ]);
  const platform = nativePlatformStorage({
    deleteItemAsync: async (key) => credentials.delete(key),
  });
  const local = memoryStorage();
  const app = await harness({
    accountStorage: local,
    invoke: async () => ({ error: null }),
    ...platform,
  });
  try {
    await app.emit('SIGNED_IN', session());
    assert.equal(local.data.size, 0);
    await act(async () => app.value.deleteAccount());
    assert.equal(credentials.has(`syncapp.music.credentials.${accountA}`), false);
    assert.equal(credentials.get(`syncapp.music.credentials.${accountB}`), 'other-account-remains');
    assert.equal(credentials.get('syncapp.music.credentials'), 'guest-remains');
    assert.equal(app.value.user, null);
  } finally {
    await app.close();
  }
});

for (const intent of [
  'signIn',
  'signUp',
  'signInWithOAuth',
  'signOut',
  'deleteAccount',
  'updatePassword',
]) {
  test(`explicit ${intent} waits for durable recovery cancellation before its auth mutation`, async () => {
    const release = deferred();
    const events = [];
    const success = async () => {
      events.push('mutation');
      return { data: {}, error: null };
    };
    const app = await harness({
      invalidateRecovery: () => {
        events.push('cancel');
        return release.promise;
      },
      signInWithPassword: success,
      signUp: success,
      signOut: success,
      updateUser: success,
      invoke: success,
      ensureSocialProvider: async () => events.push('mutation'),
      signInNativeApple: async () => ({ cancelled: true }),
    });
    try {
      await app.emit('SIGNED_IN', session());
      let operation;
      await act(async () => {
        const args =
          intent === 'signInWithOAuth' ? ['apple'] : ['offline@example.test', 'synthetic-password'];
        operation = app.value[intent](...args);
      });
      assert.deepEqual(events, ['cancel']);
      await act(async () => {
        release.resolve();
        await operation;
      });
      assert.equal(events[0], 'cancel');
      assert.ok(events.includes('mutation'));
    } finally {
      await app.close();
    }
  });
}

test('password reset uses only the dedicated recovery client without changing main identity', async () => {
  let sent = 0;
  const app = await harness({
    resetPasswordForEmail: async (email, options) => {
      sent++;
      assert.equal(email, 'offline@example.test');
      assert.equal(options.redirectTo, RECOVERY_REDIRECT);
      return { data: {}, error: null };
    },
  });
  try {
    await app.emit('SIGNED_IN', session());
    await act(async () => app.value.sendPasswordReset(' offline@example.test '));
    assert.equal(sent, 1);
    assert.equal(app.value.user.id, accountA);
    assert.equal(app.value.recoveryMode, false);
  } finally {
    await app.close();
  }
});

test('a rejected recovery cancellation is observed while an older auth action holds the queue', async () => {
  const update = deferred();
  let cancellations = 0;
  let signIns = 0;
  const app = await harness({
    updateUser: () => update.promise,
    invalidateRecovery: () => {
      cancellations++;
      return cancellations === 2
        ? Promise.reject(new Error('Synthetic recovery vault unavailable'))
        : Promise.resolve();
    },
    signInWithPassword: async () => {
      signIns++;
      return { data: {}, error: null };
    },
  });
  try {
    await app.emit('SIGNED_IN', session());
    let updating, signing;
    await act(async () => {
      updating = app.value.updatePassword('synthetic-password');
    });
    await act(async () => {
      signing = app.value.signIn('offline@example.test', 'synthetic-password');
    });
    const rejected = assert.rejects(signing, /recovery vault unavailable/);
    // Node reports an unhandled eager cancellation here unless the provider
    // observes it immediately, independently of its later queued await.
    await new Promise(setImmediate);
    await act(async () => {
      update.resolve({ data: {}, error: null });
      await updating;
      await rejected;
    });
    assert.equal(signIns, 0, 'a failed durable cancellation must still prevent sign-in');
    assert.equal(app.value.user.id, accountA);
  } finally {
    await app.close();
  }
});
