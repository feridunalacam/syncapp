import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { createAuthRecoveryState } from '../src/lib/authRecoveryState.js';
import { AUTH_REDIRECT, RECOVERY_REDIRECT, parseAuthLink } from '../src/lib/authLinks.js';
import { authExchangeDiagnostic, createAuthCodeExchanger } from '../src/lib/authCodeExchange.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
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
  };
  const context = {
    React,
    createContext: React.createContext,
    useContext: React.useContext,
    useEffect: React.useEffect,
    useRef: React.useRef,
    useState: React.useState,
    AsyncStorage: {},
    clearAccountPlatforms: () => {},
    AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
    Linking: {
      getInitialURL: () => Promise.resolve(null),
      addEventListener(_event, callback) {
        urlListener = callback;
        return { remove: () => {} };
      },
    },
    WebBrowser: {},
    supabase: { auth },
    isSupabaseConfigured: true,
    authStorage: store,
    AUTH_REDIRECT,
    RECOVERY_REDIRECT,
    parseAuthLink,
    authExchangeDiagnostic,
    createAuthCodeExchanger,
    createAuthRecoveryState,
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
