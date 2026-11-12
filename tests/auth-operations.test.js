import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createAuthSessionStorage } from '../src/lib/authSessionStorage.js';
import { createAuthOperationQueue } from '../src/lib/authOperations.js';

const require = createRequire(import.meta.url);
const { GoTrueClient } = require('@supabase/auth-js');
const accountA = '10101010-1010-4010-8010-101010101010';
const accountB = '20202020-2020-4020-8020-202020202020';
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function setup() {
  const values = new Map();
  const storage = createAuthSessionStorage({
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => {
      values.set(key, value);
    },
    deleteItemAsync: async (key) => {
      values.delete(key);
    },
  });
  const updateReached = deferred();
  const updateResponse = deferred();
  const calls = [];
  const response = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01' },
    });
  const options = {
    url: 'https://offline-test.invalid/auth/v1',
    storageKey: 'offline-session-operation-test',
    storage,
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: false,
    fetch: async (input, init) => {
      const url = new URL(input);
      if (url.pathname.endsWith('/token') && url.searchParams.get('grant_type') === 'password') {
        const body = JSON.parse(init.body);
        const userId = body.email === 'a@example.test' ? accountA : accountB;
        calls.push(`signin:${userId}`);
        const payload = Buffer.from(
          JSON.stringify({
            sub: userId,
            exp: Math.floor(Date.now() / 1000) + 3600,
          }),
        ).toString('base64url');
        return response({
          access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.offline-signature`,
          refresh_token: `offline-refresh-${userId}`,
          token_type: 'bearer',
          expires_in: 3600,
          user: { id: userId },
        });
      }
      if (url.pathname.endsWith('/user') && init.method === 'PUT') {
        calls.push('update');
        updateReached.resolve();
        const failure = await updateResponse.promise;
        return failure
          ? response({ code: 'unexpected_failure', msg: 'Offline fixture failure' }, 500)
          : response({ user: { id: accountA } });
      }
      if (url.pathname.endsWith('/logout')) {
        calls.push('signout');
        return response({});
      }
      assert.fail('Unexpected endpoint; real HTTP requests are forbidden.');
    },
  };
  return {
    auth: new GoTrueClient(options),
    run: createAuthOperationQueue(),
    reopen: () => new GoTrueClient(options),
    updateReached,
    updateResponse,
    calls,
  };
}

test('a delayed real SDK password update cannot resurrect a signed-out session after a cold reopen', async () => {
  const app = setup();
  await app.run(() =>
    app.auth.signInWithPassword({ email: 'a@example.test', password: 'offline' }),
  );
  const updating = app.run(() => app.auth.updateUser({ password: 'offline-replacement' }));
  await app.updateReached.promise;
  const signingOut = app.run(() => app.auth.signOut({ scope: 'local' }));
  assert.deepEqual(app.calls, [`signin:${accountA}`, 'update']);
  app.updateResponse.resolve(false);
  assert.equal((await updating).error, null);
  assert.equal((await signingOut).error, null);
  assert.equal((await app.auth.getSession()).data.session, null);
  assert.equal((await app.reopen().getSession()).data.session, null);
});

test('a newer real SDK sign-in is saved after a pending earlier password update', async () => {
  const app = setup();
  await app.run(() =>
    app.auth.signInWithPassword({ email: 'a@example.test', password: 'offline' }),
  );
  const updating = app.run(() => app.auth.updateUser({ password: 'offline-replacement' }));
  await app.updateReached.promise;
  const signingIn = app.run(() =>
    app.auth.signInWithPassword({ email: 'b@example.test', password: 'offline' }),
  );
  assert.deepEqual(app.calls, [`signin:${accountA}`, 'update']);
  app.updateResponse.resolve(false);
  await updating;
  assert.equal((await signingIn).data.user.id, accountB);
  assert.equal((await app.auth.getSession()).data.session.user.id, accountB);
  assert.equal((await app.reopen().getSession()).data.session.user.id, accountB);
});

test('a failed SDK mutation does not strand the following sign-out', async () => {
  const app = setup();
  await app.run(() =>
    app.auth.signInWithPassword({ email: 'a@example.test', password: 'offline' }),
  );
  const updating = app.run(async () => {
    const result = await app.auth.updateUser({ password: 'offline-replacement' });
    if (result.error) throw result.error;
  });
  await app.updateReached.promise;
  const rejected = assert.rejects(updating, /Offline fixture failure/);
  const signingOut = app.run(() => app.auth.signOut({ scope: 'local' }));
  app.updateResponse.resolve(true);
  await rejected;
  assert.equal((await signingOut).error, null);
  assert.equal((await app.auth.getSession()).data.session, null);
});
