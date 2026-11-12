import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createRequire } from 'node:module';
import { createAuthCredentialWriters } from '../src/lib/authCredentialWrites.js';
import { createAuthSessionStorage } from '../src/lib/authSessionStorage.js';
import { createAuthRecoveryStorage } from '../src/lib/authRecoveryStorage.js';
import { createAuthOperationQueue } from '../src/lib/authOperations.js';

const require = createRequire(import.meta.url);
const { GoTrueClient, processLock } = require('@supabase/auth-js');
const source = readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace(/^export /gm, '');
const A = '11111111-1111-4111-8111-111111111111',
  B = '22222222-2222-4222-8222-222222222222';
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const response = (data) =>
  new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
const session = (id, refresh) => ({
  access_token: `e30.${Buffer.from(JSON.stringify({ sub: id, session_id: id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.synthetic`,
  refresh_token: refresh,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id },
});
function harness(name, { read, fetcher }) {
  const secure = new Map();
  const storage = createAuthSessionStorage({
    getItemAsync: async (key) => {
      const value = secure.get(key) ?? null;
      await read?.(key);
      return value;
    },
    setItemAsync: async (key, value) => {
      secure.set(key, value);
    },
    deleteItemAsync: async (key) => {
      secure.delete(key);
    },
  });
  let auth, configuredKey;
  const url = `https://offline-${name}.invalid`;
  const mainKey = `sb-offline-${name}-auth-token`;
  const configuredClients = [];
  const scope = {
    process: {
      env: {
        EXPO_PUBLIC_SUPABASE_URL: url,
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'offline-fixture',
      },
    },
    URL,
    Platform: { OS: 'ios' },
    SecureStore: {},
    AsyncStorage: {},
    processLock,
    createAuthCredentialWriters,
    createAuthRecoveryStorage,
    createAuthSessionStorage: () => storage,
    installNativeAuthCrypto: () => true,
    createAuthFetch: (fetch) => fetch,
    fetch: fetcher,
    createClient(_url, _key, options) {
      const clientAuth = new GoTrueClient({
        ...options.auth,
        autoRefreshToken: false,
        url: `${url}/auth/v1`,
        fetch: fetcher,
      });
      configuredClients.push(options.auth);
      if (options.auth.storageKey === mainKey) {
        configuredKey = options.auth.storageKey;
        auth = clientAuth;
        assert.equal(options.auth.lock, processLock, 'main identity retains the SDK lock');
        assert.equal(options.auth.storage, storage);
      } else {
        assert.equal(options.auth.storageKey, `${mainKey}-recovery-v1`);
        assert.equal(
          options.auth.lock,
          undefined,
          'the sessionless recovery client has its own queue',
        );
        assert.equal(options.auth.autoRefreshToken, false);
        assert.notEqual(options.auth.storage, storage);
      }
      return { auth: clientAuth };
    },
  };
  new Script(
    `${source}\nglobalThis.idTokenSignIn = signInWithNativeIdToken; globalThis.writers = authCredentialWriters;`,
  ).runInNewContext(scope);
  assert.equal(configuredKey, mainKey, 'the explicit slot must preserve the SDK default');
  assert.equal(configuredClients.length, 2);
  const enqueue = createAuthOperationQueue();
  return {
    auth,
    storage,
    key: configuredKey,
    signIn: (credentials, isCurrent) => enqueue(() => scope.idTokenSignIn(credentials, isCurrent)),
    write: (method, credentials) => enqueue(() => scope.writers[method](credentials)),
    enqueue,
  };
}

test('a held old-account refresh cannot overwrite native Apple sign-in with real SDK and chunked storage', async () => {
  const reached = deferred(),
    release = deferred();
  let afterRefresh = false,
    held = false,
    idRequests = 0;
  const events = [];
  const h = harness('native-old-refresh', {
    read: async (key) => {
      if (afterRefresh && !held && key === 'sync.auth.sb-offline-native-old-refresh-auth-token') {
        held = true;
        reached.resolve();
        await release.promise;
      }
    },
    fetcher: async (input) => {
      const grant = new URL(input).searchParams.get('grant_type');
      if (grant === 'password') return response(session(A, 'A-original'));
      if (grant === 'refresh_token') {
        afterRefresh = true;
        return response(session(A, 'A-rotated'));
      }
      if (grant === 'id_token') {
        idRequests++;
        return response(session(B, 'B-current'));
      }
      assert.fail('Unexpected fixture request');
    },
  });
  h.auth.onAuthStateChange((event, value) => {
    events.push([event, value?.user?.id]);
  });
  try {
    await h.auth.initialize();
    await h.enqueue(() =>
      h.auth.signInWithPassword({ email: 'a@example.test', password: 'synthetic' }),
    );
    const refresh = h.auth.refreshSession();
    await reached.promise;
    const signIn = h.signIn({ provider: 'apple', token: 'synthetic', nonce: 'synthetic' });
    await new Promise(setImmediate);
    assert.equal(idRequests, 0, 'ID-token exchange waits for the SDK refresh lock');
    release.resolve();
    const [signedIn] = await Promise.all([signIn, refresh]);
    assert.equal(signedIn.data.user.id, B);
    assert.equal(JSON.parse(await h.storage.getItem(h.key)).user.id, B);
    assert.deepEqual(
      events.filter(([event]) => event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN').slice(-2),
      [
        ['TOKEN_REFRESHED', A],
        ['SIGNED_IN', B],
      ],
    );
  } finally {
    release.resolve();
    await h.auth.stopAutoRefresh();
  }
});

test('a refresh started during native login waits and rotates the newly selected account instead', async () => {
  const reached = deferred(),
    release = deferred();
  const refreshTokens = [];
  const h = harness('native-new-refresh', {
    fetcher: async (input, options) => {
      const grant = new URL(input).searchParams.get('grant_type');
      if (grant === 'password') return response(session(A, 'A-original'));
      if (grant === 'id_token') {
        reached.resolve();
        await release.promise;
        return response(session(B, 'B-current'));
      }
      if (grant === 'refresh_token') {
        const token = JSON.parse(options.body).refresh_token;
        refreshTokens.push(token);
        return response(session(B, 'B-rotated'));
      }
      assert.fail('Unexpected fixture request');
    },
  });
  try {
    await h.auth.initialize();
    await h.auth.signInWithPassword({ email: 'a@example.test', password: 'synthetic' });
    const signIn = h.signIn({ provider: 'apple', token: 'synthetic', nonce: 'synthetic' });
    await reached.promise;
    const refresh = h.auth.refreshSession();
    await new Promise(setImmediate);
    assert.deepEqual(refreshTokens, []);
    release.resolve();
    await Promise.all([signIn, refresh]);
    assert.deepEqual(refreshTokens, ['B-current']);
    const saved = JSON.parse(await h.storage.getItem(h.key));
    assert.equal(saved.user.id, B);
    assert.equal(saved.refresh_token, 'B-rotated');
  } finally {
    release.resolve();
    await h.auth.stopAutoRefresh();
  }
});

test('native sign-in can start before initialization and failure releases the lock for later reads', async () => {
  const h = harness('native-init-error', {
    fetcher: async () =>
      new Response(
        JSON.stringify({
          error: 'invalid_request',
          error_description: 'Synthetic invalid ID token',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
  });
  try {
    const result = await h.signIn({ provider: 'apple', token: 'synthetic', nonce: 'synthetic' });
    assert.ok(result.error);
    assert.equal((await h.auth.getSession()).data.session, null);
  } finally {
    await h.auth.stopAutoRefresh();
  }
});

for (const [kind, method] of [
  ['password', 'signInWithPassword'],
  ['signup', 'signUp'],
]) {
  test(`${kind} sign-in and an old-account SDK refresh share the same credential-write boundary`, async () => {
    const reached = deferred(),
      release = deferred();
    let afterRefresh = false,
      held = false,
      newRequests = 0;
    const name = `entry-${kind}`;
    const h = harness(name, {
      read: async (key) => {
        if (afterRefresh && !held && key === `sync.auth.sb-offline-${name}-auth-token`) {
          held = true;
          reached.resolve();
          await release.promise;
        }
      },
      fetcher: async (input, options) => {
        const endpoint = new URL(input);
        const grant = endpoint.searchParams.get('grant_type');
        if (grant === 'refresh_token') {
          afterRefresh = true;
          return response(session(A, 'A-rotated'));
        }
        const email = JSON.parse(options.body).email;
        if (grant === 'password' && email === 'a@example.test')
          return response(session(A, 'A-original'));
        if (
          (grant === 'password' || endpoint.pathname.endsWith('/signup')) &&
          email === 'b@example.test'
        ) {
          newRequests++;
          return response(session(B, 'B-current'));
        }
        assert.fail('Unexpected fixture request');
      },
    });
    try {
      await h.auth.initialize();
      await h.auth.signInWithPassword({ email: 'a@example.test', password: 'synthetic' });
      const refresh = h.auth.refreshSession();
      await reached.promise;
      const writing = h.write(method, { email: 'b@example.test', password: 'synthetic' });
      await new Promise(setImmediate);
      assert.equal(newRequests, 0);
      release.resolve();
      const [result] = await Promise.all([writing, refresh]);
      assert.equal(result.data.user.id, B);
      assert.equal(JSON.parse(await h.storage.getItem(h.key)).user.id, B);
    } finally {
      release.resolve();
      await h.auth.stopAutoRefresh();
    }
  });
}

for (const reason of ['cancelled', 'account changed']) {
  test(`a native attempt ${reason} while waiting for the SDK lock never starts its ID-token request`, async () => {
    const reached = deferred(),
      release = deferred();
    let current = true,
      requests = 0;
    const h = harness(`guard-${reason.split(' ')[0]}`, {
      fetcher: async () => {
        requests++;
        return response(session(B, 'B-current'));
      },
    });
    try {
      await h.auth.initialize();
      const blocker = processLock(`lock:${h.key}`, -1, async () => {
        reached.resolve();
        await release.promise;
      });
      await reached.promise;
      const writing = h.signIn(
        { provider: 'apple', token: 'synthetic', nonce: 'synthetic' },
        () => current,
      );
      await new Promise(setImmediate);
      current = false;
      release.resolve();
      assert.equal((await writing).cancelled, true);
      await blocker;
      assert.equal(requests, 0);
      assert.equal((await h.auth.getSession()).data.session, null);
    } finally {
      release.resolve();
      await h.auth.stopAutoRefresh();
    }
  });
}
