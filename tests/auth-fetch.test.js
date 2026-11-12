import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createAuthFetch, AUTH_REQUEST_TIMEOUT_MS } from '../src/lib/authFetch.js';
import { createAuthOperationQueue } from '../src/lib/authOperations.js';

const require = createRequire(import.meta.url);
const { GoTrueClient } = require('@supabase/auth-js');
const nativeFetch = require('whatwg-fetch');
const project = 'https://offline-test.invalid';
const response = (value, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01' },
  });
function clock() {
  let fire,
    clears = 0;
  return {
    setTimer(callback, delay) {
      fire = callback;
      assert.equal(delay, AUTH_REQUEST_TIMEOUT_MS);
      return 1;
    },
    clearTimer() {
      clears++;
    },
    expire: () => fire(),
    get clears() {
      return clears;
    },
  };
}

test('only this project Auth and exact account deletion are bounded', async () => {
  const timer = clock();
  const signals = [];
  const fetcher = createAuthFetch(
    async (_input, options) => {
      signals.push(options?.signal);
      return response({ status: 'fixture' });
    },
    project,
    timer,
  );
  const upstream = new AbortController();
  for (const url of [
    `${project}/rest/v1/account_backups`,
    `${project}/functions/v1/sync-subscription`,
    `${project}/functions/v1/delete-account-extra`,
    `${project}/functions/v1/delete-account/other`,
    `${project}/auth/v10/token`,
    'https://another.invalid/auth/v1/token',
    'https://another.invalid/functions/v1/delete-account',
  ])
    await fetcher(url, { signal: upstream.signal });
  assert.ok(signals.every((signal) => signal === upstream.signal));
  assert.equal(timer.clears, 0);
  const result = await fetcher(new URL(`${project}/auth/v1/token`));
  assert.deepEqual(await result.json(), { status: 'fixture' });
  assert.ok(signals.at(-1) instanceof AbortSignal);
  assert.equal(timer.clears, 1);
  await fetcher(`${project}/functions/v1/delete-account`);
  assert.ok(signals.at(-1) instanceof AbortSignal);
  assert.equal(timer.clears, 2);
});

test('upstream cancellation reaches native fetch and removes its listener after rejection', async () => {
  const timer = clock();
  let removes = 0,
    incoming;
  const upstream = new AbortController();
  const remove = upstream.signal.removeEventListener.bind(upstream.signal);
  upstream.signal.removeEventListener = (...args) => {
    removes++;
    return remove(...args);
  };
  const fetcher = createAuthFetch(
    (_input, options) => {
      incoming = options.signal;
      return new Promise((_resolve, reject) =>
        incoming.addEventListener('abort', () => reject(new Error('Native cancellation fixture'))),
      );
    },
    project,
    timer,
  );
  const pending = fetcher(`${project}/auth/v1/user`, { signal: upstream.signal });
  const rejected = assert.rejects(pending, /Native cancellation fixture/);
  upstream.abort();
  await rejected;
  assert.equal(incoming.aborted, true);
  assert.equal(removes, 1);
  assert.equal(timer.clears, 1);
});

test('the timeout covers a stalled Auth body and preserves empty logout responses', async () => {
  const timer = clock();
  const fetcher = createAuthFetch(
    async (_input, options) => ({
      status: 200,
      text: () =>
        new Promise((_resolve, reject) =>
          options.signal.addEventListener('abort', () =>
            reject(new Error('Body cancelled fixture')),
          ),
        ),
    }),
    project,
    timer,
  );
  const pending = fetcher(`${project}/auth/v1/user`);
  const rejected = assert.rejects(pending, /Body cancelled fixture/);
  await Promise.resolve();
  timer.expire();
  await rejected;
  assert.equal(timer.clears, 1);
  const logout = createAuthFetch(async () => response(null, 204), project, clock());
  assert.equal((await logout(`${project}/auth/v1/logout`)).status, 204);
});

test('a native transport ignoring abort cannot release a live mutation queue or later save a timed-out response', async () => {
  const timer = clock();
  let finish,
    later = false;
  const fetcher = createAuthFetch(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    project,
    timer,
  );
  const run = createAuthOperationQueue();
  const pending = run(() => fetcher(`${project}/auth/v1/user`));
  const rejected = assert.rejects(pending, /cancelled/);
  await Promise.resolve();
  const following = run(() => {
    later = true;
  });
  timer.expire();
  await Promise.resolve();
  assert.equal(later, false);
  finish(response({ user: { id: 'offline-fixture' } }));
  await rejected;
  await following;
  assert.equal(later, true);
});

test('the installed SDK password request settles on native abort and the following operation runs', async () => {
  const timer = clock();
  let requests = 0;
  const auth = new GoTrueClient({
    url: `${project}/auth/v1`,
    storageKey: 'offline-auth-timeout',
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
    fetch: createAuthFetch(
      (_input, options) => {
        requests++;
        return new Promise((_resolve, reject) =>
          options.signal.addEventListener('abort', () =>
            reject(new Error('Native request cancelled fixture')),
          ),
        );
      },
      project,
      timer,
    ),
  });
  await auth.initialize();
  const run = createAuthOperationQueue();
  const pending = run(() =>
    auth.signInWithPassword({ email: 'offline@example.test', password: 'offline-fixture' }),
  );
  await new Promise(setImmediate);
  timer.expire();
  assert.equal((await pending).error.name, 'AuthRetryableFetchError');
  await run(() => auth.signOut({ scope: 'local' }));
  assert.equal(requests, 1);
  assert.equal((await auth.getSession()).data.session, null);
});

test('expired-session bootstrap aborts once per SDK retry window and preserves the offline record', async () => {
  const actualNow = Date.now;
  let now = actualNow(),
    requests = 0;
  Date.now = () => now;
  const stored = {
    access_token: 'offline-fixture',
    refresh_token: 'offline-refresh-fixture',
    expires_at: Math.floor(now / 1000) - 3600,
    user: { id: 'offline-account' },
  };
  const values = new Map([['offline-bootstrap', JSON.stringify(stored)]]);
  const timer = {
    setTimer(callback, delay) {
      return setImmediate(() => {
        now += delay;
        callback();
      });
    },
    clearTimer: clearImmediate,
  };
  try {
    const auth = new GoTrueClient({
      url: `${project}/auth/v1`,
      storageKey: 'offline-bootstrap',
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
      storage: {
        getItem: async (key) => values.get(key) ?? null,
        setItem: async (key, value) => values.set(key, value),
        removeItem: async (key) => values.delete(key),
      },
      fetch: createAuthFetch(
        (_input, options) => {
          requests++;
          return new Promise((_resolve, reject) =>
            options.signal.addEventListener('abort', () =>
              reject(new Error('Native refresh cancelled fixture')),
            ),
          );
        },
        project,
        timer,
      ),
    });
    await auth.initialize();
    const result = await auth.getSession();
    assert.equal(result.error.name, 'AuthRetryableFetchError');
    assert.equal(requests, 1);
    assert.equal(values.get('offline-bootstrap'), JSON.stringify(stored));
    assert.equal(now - actualNow() < 31000, true);
  } finally {
    Date.now = actualNow;
  }
});

test('the installed React Native fetch polyfill forwards deadline aborts to XMLHttpRequest', async () => {
  const previousXHR = globalThis.XMLHttpRequest;
  const previousResponse = globalThis.Response;
  let aborts = 0;
  globalThis.XMLHttpRequest = class {
    open() {}
    setRequestHeader() {}
    send() {}
    abort() {
      aborts++;
      this.readyState = 4;
      this.onreadystatechange?.();
      this.onabort?.();
    }
  };
  globalThis.Response = nativeFetch.Response;
  try {
    const timer = clock();
    const fetcher = createAuthFetch(nativeFetch.fetch, project, timer);
    const pending = fetcher(`${project}/auth/v1/token`);
    const rejected = assert.rejects(pending, { name: 'AbortError' });
    timer.expire();
    await rejected;
    assert.equal(aborts, 1);
    assert.equal(timer.clears, 1);
    const successful = createAuthFetch(
      async () => response({ user: 'offline-fixture' }),
      project,
      clock(),
    );
    assert.deepEqual(await (await successful(`${project}/auth/v1/user`)).json(), {
      user: 'offline-fixture',
    });
  } finally {
    globalThis.XMLHttpRequest = previousXHR;
    globalThis.Response = previousResponse;
  }
});
