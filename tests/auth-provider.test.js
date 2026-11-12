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
import { createAuthFetch, AUTH_REQUEST_TIMEOUT_MS } from '../src/lib/authFetch.js';
import { AUTH_REDIRECT, RECOVERY_REDIRECT, parseAuthLink } from '../src/lib/authLinks.js';
import { authExchangeDiagnostic, createAuthCodeExchanger } from '../src/lib/authCodeExchange.js';
import { createSocialAuth } from '../src/lib/socialAuth.js';

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
  };
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
    updateUser: options.updateUser || (async () => ({ data: {}, error: null })),
    signInWithPassword: options.signInWithPassword || (async () => ({ data: {}, error: null })),
    signOut: options.signOut || (async () => ({ data: {}, error: null })),
  };
  const context = {
    React,
    createContext: React.createContext,
    useContext: React.useContext,
    useEffect: React.useEffect,
    useRef: React.useRef,
    useState: React.useState,
    AsyncStorage: {},
    clearAccountPlatforms: options.clearAccountPlatforms || (() => {}),
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
    recoverySessionIdentity,
    createAuthOperationQueue,
    createSocialAuth,
    AUTH_SERVICE_ORIGIN: 'https://fixture.supabase.co',
    ensureSocialProvider: async () => {},
    signInNativeApple: async () => null,
    signInWithNativeIdToken: async () => assert.fail('Unexpected native login'),
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
      receiving = app.dispatchLink(`${RECOVERY_REDIRECT}?code=next-recovery`);
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
