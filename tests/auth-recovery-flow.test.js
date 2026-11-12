import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { createAuthSessionStorage } from '../src/lib/authSessionStorage.js';
import { createAuthRecoveryStorage } from '../src/lib/authRecoveryStorage.js';
import { createAuthRecoveryFlow } from '../src/lib/authRecoveryFlow.js';
import { createAuthRecoveryState, recoverySessionIdentity } from '../src/lib/authRecoveryState.js';
import { createAuthOperationQueue } from '../src/lib/authOperations.js';
import { createAuthCredentialWriters } from '../src/lib/authCredentialWrites.js';
import { createAuthFetch } from '../src/lib/authFetch.js';
import { parseAuthLink, RECOVERY_REDIRECT } from '../src/lib/authLinks.js';

const require = createRequire(import.meta.url);
const { GoTrueClient, processLock } = require('@supabase/auth-js');
const origin = 'https://offline-recovery.invalid';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const sid = (id) => `${id.slice(0, 8)}-1111-4111-8111-${id.slice(-12)}`;
const jwt = (id) => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256' })}.${encode({ sub: id, session_id: sid(id), exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic-signature`;
};
const session = (id) => ({
  access_token: jwt(id),
  refresh_token: `synthetic-refresh-${id[0]}`,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600,
  token_type: 'bearer',
  user: { id },
});
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01' },
  });
const settle = () => new Promise(setImmediate);
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function aborted(signal) {
  return new Promise((_, reject) => {
    const cancel = () => {
      const error = new Error('Synthetic request aborted');
      error.name = 'AbortError';
      reject(error);
    };
    if (signal.aborted) cancel();
    else signal.addEventListener('abort', cancel, { once: true });
  });
}

let harnessId = 0;
async function harness(t, options = {}) {
  // No device, dotenv, credentials or network: all SDK HTTP is injected below.
  const nativeRecords = new Map();
  const vault = createAuthSessionStorage({
    getItemAsync: async (key) => nativeRecords.get(key) ?? null,
    setItemAsync: async (key, value) => {
      nativeRecords.set(key, value);
    },
    deleteItemAsync: async (key) => {
      nativeRecords.delete(key);
    },
  });
  const writes = [];
  const durable = {
    ...vault,
    setItem: async (key, value) => {
      writes.push({ key, value });
      await vault.setItem(key, value);
    },
  };
  const mainKey = `offline-main-${++harnessId}`;
  const recoveryKey = `${mainKey}-recovery`;
  const requests = { recover: 0, pkce: 0, refresh: 0, adopt: 0, password: 0, logout: 0 };
  const flows = new Map();
  const pkceStarted = deferred();
  const adoptionStarted = deferred();
  const adoptionReply = deferred();
  const enqueue = createAuthOperationQueue();
  const Bsession = session(B);
  const bounded = createAuthFetch(
    async (input, init) => {
      const url = new URL(input);
      const body = init?.body ? JSON.parse(init.body) : null;
      if (url.pathname.endsWith('/recover')) {
        requests.recover++;
        const redirect = new URL(url.searchParams.get('redirect_to'));
        assert.equal(
          `${redirect.protocol}//${redirect.host}${redirect.pathname}`,
          RECOVERY_REDIRECT,
        );
        const flowId = redirect.searchParams.get('sb_flow_id');
        assert.match(flowId, /^[0-9a-f]{32}$/);
        assert.equal(body.code_challenge_method, 's256');
        flows.set(flowId, body.code_challenge);
        return json({});
      }
      if (url.pathname.endsWith('/token') && url.searchParams.get('grant_type') === 'pkce') {
        requests.pkce++;
        const flowId = body.auth_code.slice('synthetic-code-'.length);
        assert.equal(
          createHash('sha256').update(body.code_verifier).digest('base64url'),
          flows.get(flowId),
        );
        pkceStarted.resolve();
        if (options.holdPkce || options.timeoutPkce) return aborted(init.signal);
        return json(Bsession);
      }
      if (
        url.pathname.endsWith('/token') &&
        url.searchParams.get('grant_type') === 'refresh_token'
      ) {
        requests.refresh++;
        return json({ code: 'refresh_token_not_found', msg: 'Synthetic expired old session' }, 400);
      }
      if (url.pathname.endsWith('/user')) {
        requests.adopt++;
        adoptionStarted.resolve();
        if (options.holdAdoption) await adoptionReply.promise;
        return json({ id: B });
      }
      if (url.pathname.endsWith('/token') && url.searchParams.get('grant_type') === 'password') {
        requests.password++;
        return json(session(C));
      }
      if (url.pathname.endsWith('/logout')) {
        requests.logout++;
        return new Response(null, { status: 204 });
      }
      assert.fail('Unexpected endpoint: real HTTP must never be used.');
    },
    origin,
    { timeoutMs: options.timeoutPkce ? 20 : 2000 },
  );
  await durable.setItem(mainKey, JSON.stringify(session(A)));
  const mainAuth = new GoTrueClient({
    url: `${origin}/auth/v1`,
    storageKey: mainKey,
    storage: durable,
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    lock: processLock,
    fetch: bounded,
  });
  await mainAuth.initialize();
  let recoveryVisible = false;
  const marker = createAuthRecoveryState({
    storage: durable,
    onChange: (value) => {
      recoveryVisible = value;
    },
  });
  const listener = mainAuth.onAuthStateChange((event, next) => {
    // Real AuthProvider keeps subscribers synchronous, never joining Auth's queue.
    marker.observe(next, event);
  });
  const marked = [];
  const clients = [];
  const coordinators = [];
  let recoveryStorage;
  function createCoordinator() {
    recoveryStorage = createAuthRecoveryStorage({ storage: durable, storageKey: recoveryKey });
    const ownStorage = recoveryStorage;
    const auth = new GoTrueClient({
      url: `${origin}/auth/v1`,
      storageKey: recoveryKey,
      storage: ownStorage.storage,
      flowType: 'pkce',
      experimental: { appendPkceFlowIdToRedirects: true },
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      // Match the runtime: recoveryStorage.run owns this sessionless client's
      // operations; only the canonical main client retains processLock.
      fetch: (input, init) => bounded(input, { ...init, signal: ownStorage.signal }),
    });
    clients.push(auth);
    const canonicalAuth = options.invalidRedirectType
      ? {
          initialize: () => auth.initialize(),
          resetPasswordForEmail: (...args) => auth.resetPasswordForEmail(...args),
          exchangeCodeForSession: async (...args) => {
            const result = await auth.exchangeCodeForSession(...args);
            return { ...result, data: { ...result.data, redirectType: null } };
          },
        }
      : auth;
    const coordinator = createAuthRecoveryFlow({
      auth: canonicalAuth,
      storage: ownStorage,
      mainAuth,
      enqueue,
      onRecovery: async (adopted) => {
        const actual = (await mainAuth.getSession()).data.session;
        assert.deepEqual(recoverySessionIdentity(adopted), recoverySessionIdentity(actual));
        marked.push(recoverySessionIdentity(adopted));
        await marker.observe(adopted, 'PASSWORD_RECOVERY');
      },
    });
    coordinators.push(coordinator);
    return coordinator;
  }
  const flow = createCoordinator();
  t.after(() => {
    coordinators.forEach((item) => item.dispose());
    clients.forEach((item) => item.stopAutoRefresh());
    mainAuth.stopAutoRefresh();
    listener.data.subscription.unsubscribe();
    adoptionReply.resolve();
  });
  const assertSecondaryNotPersisted = async () => {
    assert.equal(await vault.getItem(recoveryKey), null);
    assert.equal(await vault.getItem(`${recoveryKey}-user`), null);
    for (const write of writes.filter((entry) => entry.key.startsWith(recoveryKey))) {
      assert.equal(write.key, `${recoveryKey}.pending.v1`);
      assert.equal(write.value.includes(Bsession.access_token), false);
      assert.equal(write.value.includes(Bsession.refresh_token), false);
    }
    assert.equal(requests.logout, 0, 'Secondary cleanup must not revoke adopted credentials');
  };
  return {
    flow,
    mainAuth,
    mainKey,
    vault,
    enqueue,
    requests,
    marked,
    pkceStarted,
    adoptionStarted,
    adoptionReply,
    createCoordinator,
    assertSecondaryNotPersisted,
    get recoveryVisible() {
      return recoveryVisible;
    },
    async send() {
      await flow.send('synthetic-reviewer@example.invalid');
      const flowId = [...flows.keys()].at(-1);
      return parseAuthLink(
        `${RECOVERY_REDIRECT}?code=synthetic-code-${flowId}&sb_flow_id=${flowId}`,
      );
    },
  };
}

test('old expired main-session teardown cannot erase recovery and only the adopted main session opens its form', async (t) => {
  const h = await harness(t);
  const callback = await h.send();
  const old = (await h.mainAuth.getSession()).data.session;
  await h.vault.setItem(
    h.mainKey,
    JSON.stringify({ ...old, expires_at: Math.floor(Date.now() / 1000) - 1 }),
  );
  assert.equal((await h.mainAuth.refreshSession()).error.code, 'refresh_token_not_found');
  assert.equal((await h.mainAuth.getSession()).data.session, null);
  const result = await h.flow.receive(callback);
  assert.equal(result.session.user.id, B);
  await settle();
  assert.deepEqual(h.marked, [{ userId: B, sessionId: sid(B) }]);
  assert.equal(h.recoveryVisible, true);
  assert.equal(h.requests.pkce, 1);
  assert.equal(h.requests.adopt, 1);
  await h.assertSecondaryNotPersisted();
});

test('pending encrypted recovery survives coordinator/client recreation and duplicate delivery adopts once', async (t) => {
  const h = await harness(t);
  const callback = await h.send();
  h.flow.dispose();
  const recreated = h.createCoordinator();
  const first = recreated.receive(callback);
  assert.equal(recreated.receive(callback), first);
  await first;
  await recreated.receive(callback);
  assert.equal(h.requests.pkce, 1);
  assert.equal(h.requests.adopt, 1);
  assert.deepEqual(h.marked, [{ userId: B, sessionId: sid(B) }]);
  await h.assertSecondaryNotPersisted();
});

test('explicit cancellation during secondary exchange aborts it without adopting or marking recovery', async (t) => {
  const h = await harness(t, { holdPkce: true });
  const callback = await h.send();
  const result = h.flow.receive(callback);
  await h.pkceStarted.promise;
  await h.flow.cancel();
  assert.equal((await result).cancelled, true);
  assert.equal(h.requests.adopt, 0);
  assert.equal((await h.mainAuth.getSession()).data.session.user.id, A);
  assert.deepEqual(h.marked, []);
  await h.assertSecondaryNotPersisted();
});

test('cancellation after main adoption starts suppresses recovery and the queued newer sign-in remains final', async (t) => {
  const h = await harness(t, { holdAdoption: true });
  const callback = await h.send();
  const recovering = h.flow.receive(callback);
  await h.adoptionStarted.promise;
  await h.flow.cancel();
  const writers = createAuthCredentialWriters({
    auth: h.mainAuth,
    storageKey: h.mainKey,
    lock: processLock,
  });
  const newer = h.enqueue(() =>
    writers.signInWithPassword({ email: 'newer@example.invalid', password: 'synthetic-password' }),
  );
  h.adoptionReply.resolve();
  assert.equal((await recovering).cancelled, true);
  assert.equal((await newer).error, null);
  assert.equal((await h.mainAuth.getSession()).data.session.user.id, C);
  assert.deepEqual(h.marked, []);
  assert.equal(h.recoveryVisible, false);
  await h.assertSecondaryNotPersisted();
});

test('a successful SDK exchange without recovery redirect type never reaches main identity', async (t) => {
  const h = await harness(t, { invalidRedirectType: true });
  await assert.rejects(h.flow.receive(await h.send()), /new password reset link/);
  assert.equal(h.requests.pkce, 1);
  assert.equal(h.requests.adopt, 0);
  assert.equal((await h.mainAuth.getSession()).data.session.user.id, A);
  assert.deepEqual(h.marked, []);
  await h.assertSecondaryNotPersisted();
});

test('bounded unknown exchange outcome cannot adopt or grant recovery access', async (t) => {
  const h = await harness(t, { timeoutPkce: true });
  await assert.rejects(h.flow.receive(await h.send()));
  assert.equal(h.requests.pkce, 1);
  assert.equal(h.requests.adopt, 0);
  assert.equal((await h.mainAuth.getSession()).data.session.user.id, A);
  assert.equal(h.recoveryVisible, false);
  await h.assertSecondaryNotPersisted();
});

test('durable cancellation rejects an older emailed callback even after a fresh coordinator is created', async (t) => {
  const h = await harness(t);
  const callback = await h.send();
  await h.flow.cancel();
  h.flow.dispose();
  const recreated = h.createCoordinator();
  await assert.rejects(recreated.receive(callback), /new password reset link/);
  assert.equal(h.requests.pkce, 0);
  assert.equal(h.requests.adopt, 0);
  assert.equal((await h.mainAuth.getSession()).data.session.user.id, A);
  await h.assertSecondaryNotPersisted();
});
