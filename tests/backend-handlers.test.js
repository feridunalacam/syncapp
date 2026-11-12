import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';
import { createRequire } from 'node:module';
import * as rules from '../supabase/functions/_shared/subscriptions.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const USER_A = '10101010-1010-4010-8010-101010101010';
const USER_B = '20202020-2020-4020-8020-202020202020';
const USER_DELETED = '30303030-3030-4030-8030-303030303030';
const NOW = Date.now();
const future = new Date(NOW + 60 * 60 * 1000).toISOString();
const claims = (ageSeconds = 300) => ({
  sub: USER_A,
  session_id: USER_B,
  amr: [{ method: 'password', timestamp: Math.floor(NOW / 1000) - ageSeconds }],
});
const customer = (sandbox = false) => ({
  subscriber: {
    entitlements: { sync_pro: { product_identifier: 'monthly', expires_date: future } },
    subscriptions: { monthly: { is_sandbox: sandbox, store: 'app_store', expires_date: future } },
  },
});

// Execute the actual TypeScript handlers and shared server code, replacing only
// network/SDK boundaries. No hosted project, credentials, or users are touched.
function compile(path) {
  const source = readFileSync(new URL(`../supabase/functions/${path}`, import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/gm, '')
    .replace(/^export /gm, '');
  return transformSync(source, {
    filename: path,
    babelrc: false,
    configFile: false,
    plugins: ['@babel/plugin-transform-typescript'],
  }).code;
}
const sharedCode = compile('_shared/server.ts');
const handlerCode = Object.fromEntries(
  ['delete-account', 'sync-subscription', 'revenuecat-webhook'].map((name) => [
    name,
    compile(`${name}/index.ts`),
  ]),
);

function harness(name, options = {}) {
  const calls = [];
  let handler;
  let saved = null;
  const env = {
    SUPABASE_URL: 'https://fixture.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key',
    REVENUECAT_SECRET_API_KEY: 'fixture-revenuecat-key',
    REVENUECAT_WEBHOOK_SECRET: 'fixture-webhook-secret',
    REVENUECAT_ENVIRONMENT: 'PRODUCTION',
    REVENUECAT_ENTITLEMENT_ID: 'sync_pro',
  };
  const admin = {
    auth: {
      getUser: async (token) => ({
        data: {
          user:
            token === 'fixture-user-token'
              ? { id: USER_A, last_sign_in_at: new Date(NOW).toISOString() }
              : null,
        },
        error: token === 'fixture-user-token' ? null : { status: 401 },
      }),
      getClaims: async (token) => {
        calls.push(['claims', token]);
        return options.verifiedClaims || { data: { claims: claims() }, error: null };
      },
      admin: {
        getUserById: async (id) => {
          calls.push(['user', id]);
          return id === USER_DELETED
            ? { data: { user: null }, error: { status: 404 } }
            : { data: { user: { id } }, error: null };
        },
        signOut: async (token, scope) => {
          calls.push(['revoke', token, scope]);
          return { error: options.revokeError || null };
        },
        deleteUser: async (id, soft) => {
          calls.push(['delete', id, soft]);
          return { error: null };
        },
      },
    },
    rpc: async (method, args) => {
      calls.push([method, args]);
      if (method === 'begin_subscription_sync')
        return { data: options.duplicate ? null : 1, error: null };
      if (method === 'apply_subscription_sync') {
        saved = {
          entitlement_id: 'pro',
          expires_at: args.valid_until,
          environment: args.purchase_environment,
        };
        return { data: options.superseded ? false : true, error: null };
      }
      assert.fail(`Unexpected RPC ${method}`);
    },
    storage: {
      from: (bucket) => {
        assert.equal(bucket, 'avatars');
        return {
          list: async (id) => {
            calls.push(['list', id]);
            return { data: [], error: null };
          },
        };
      },
    },
    from: (table) => {
      assert.equal(table, 'entitlements');
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: saved, error: null }),
      };
      return query;
    },
  };
  const context = createContext({
    ...rules,
    requireRecentSignIn: (value) => rules.requireRecentSignIn(value, NOW),
    createClient: () => admin,
    Deno: {
      env: { get: (key) => env[key] },
      serve: (callback) => {
        handler = callback;
      },
    },
    Response,
    Request,
    TextEncoder,
    AbortSignal,
    console: { error: () => {} },
    fetch: async (url) => {
      const id = decodeURIComponent(url.split('/').at(-1));
      calls.push(['customer', id]);
      if (options.upstreamFailure) return new Response('{}', { status: 503 });
      const record = options.customers?.[id] || customer();
      return new Response(JSON.stringify(record), { status: 200 });
    },
  });
  new Script(`${sharedCode}\n${handlerCode[name]}`).runInContext(context);
  return {
    calls,
    request: (
      body = {},
      authorization = name === 'revenuecat-webhook'
        ? 'Bearer fixture-webhook-secret'
        : 'Bearer fixture-user-token',
      method = 'POST',
    ) =>
      handler(
        new Request('https://fixture.invalid/function', {
          method,
          headers: authorization
            ? { Authorization: authorization, 'Content-Type': 'application/json' }
            : {},
          ...(['GET', 'OPTIONS'].includes(method) ? {} : { body: JSON.stringify(body) }),
        }),
      ),
  };
}

for (const name of Object.keys(handlerCode)) {
  test(`${name} rejects missing authentication and unsupported methods before side effects`, async () => {
    const app = harness(name);
    assert.equal((await app.request({}, null)).status, 401);
    assert.equal((await app.request({}, null, 'GET')).status, 405);
    assert.equal((await app.request({}, null, 'OPTIONS')).status, 204);
    assert.deepEqual(app.calls, []);
  });
}

test('environmentless transfer canonically refreshes both owners with production-only receipts', async () => {
  const app = harness('revenuecat-webhook', {
    customers: { [USER_A]: { subscriber: {} }, [USER_B]: customer(true) },
  });
  const response = await app.request({
    event: {
      id: 'transfer-fixture',
      type: 'TRANSFER',
      transferred_from: [USER_A],
      transferred_to: [USER_B],
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(
    app.calls.filter(([method]) => method === 'customer').map(([, id]) => id),
    [USER_A, USER_B],
  );
  const writes = app.calls.filter(([method]) => method === 'apply_subscription_sync');
  assert.equal(writes.length, 2);
  assert.ok(
    writes.every(
      ([, args]) =>
        args.valid_until === rules.EXPIRED_AT && args.purchase_environment === 'PRODUCTION',
    ),
  );
});

test('anonymous-last-seen renewal refreshes UUID aliases while ignoring deleted accounts', async () => {
  const app = harness('revenuecat-webhook');
  const response = await app.request({
    event: {
      id: 'renewal-fixture',
      type: 'RENEWAL',
      environment: 'PRODUCTION',
      app_user_id: '$RCAnonymousID:fixture',
      original_app_user_id: USER_A,
      aliases: [USER_A, USER_B, USER_DELETED],
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(
    app.calls.filter(([method]) => method === 'customer').map(([, id]) => id),
    [USER_A, USER_B],
  );
});

test('sandbox webhook never reaches production billing writes', async () => {
  const app = harness('revenuecat-webhook');
  const response = await app.request({
    event: { id: 'sandbox-fixture', type: 'RENEWAL', environment: 'SANDBOX', app_user_id: USER_A },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ignored: 'different_environment' });
  assert.deepEqual(app.calls, []);
});

test('canonical sync binds identity to Auth and ignores forged request fields', async () => {
  const app = harness('sync-subscription');
  const response = await app.request({
    user_id: USER_B,
    expires_at: '2099-01-01T00:00:00Z',
    environment: 'SANDBOX',
  });
  assert.equal(response.status, 200);
  const writes = app.calls.filter(([method]) => method === 'apply_subscription_sync');
  assert.equal(writes[0][1].target_user_id, USER_A);
  assert.equal(writes[0][1].valid_until, future);
  assert.equal(writes[0][1].purchase_environment, 'PRODUCTION');
});

test('canonical upstream failure cannot expire a subscription and is retryable', async () => {
  const app = harness('sync-subscription', { upstreamFailure: true });
  assert.equal((await app.request()).status, 503);
  assert.equal(
    app.calls.some(([method]) => method === 'apply_subscription_sync'),
    false,
  );
});

test('deletion rejects an old session despite another device signing in recently', async () => {
  const app = harness('delete-account', {
    verifiedClaims: { data: { claims: claims(3600) }, error: null },
  });
  const response = await app.request({ confirmation: 'DELETE' });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: 'reauthentication_required',
    message: 'Sign in again before deleting your account.',
  });
  assert.deepEqual(
    app.calls.map(([method]) => method),
    ['claims'],
  );
});

test('deletion requires verified matching claims and explicit confirmation', async () => {
  for (const verifiedClaims of [
    { data: null, error: { message: 'Invalid signature' } },
    { data: { claims: { ...claims(), sub: USER_B } }, error: null },
    {
      data: { claims: { ...claims(), amr: [{ method: 'token_refresh', timestamp: NOW / 1000 }] } },
      error: null,
    },
  ]) {
    const app = harness('delete-account', { verifiedClaims });
    assert.equal((await app.request({ confirmation: 'DELETE' })).status, 403);
    assert.deepEqual(
      app.calls.map(([method]) => method),
      ['claims'],
    );
  }
  const app = harness('delete-account');
  assert.equal((await app.request({ confirmation: 'delete' })).status, 400);
  assert.deepEqual(
    app.calls.map(([method]) => method),
    ['claims'],
  );
});

test('recent authenticated deletion revokes sessions before deleting its Auth user', async () => {
  const app = harness('delete-account');
  const response = await app.request({ confirmation: 'DELETE', user_id: USER_B });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true, subscription_cancelled: false });
  assert.deepEqual(
    app.calls.map(([method]) => method),
    ['claims', 'list', 'revoke', 'delete'],
  );
  assert.deepEqual(app.calls.at(-2), ['revoke', 'fixture-user-token', 'global']);
  assert.deepEqual(app.calls.at(-1), ['delete', USER_A, false]);
});

test('session revocation failure prevents Auth user deletion', async () => {
  const app = harness('delete-account', { revokeError: { message: 'Auth unavailable' } });
  assert.equal((await app.request({ confirmation: 'DELETE' })).status, 503);
  assert.equal(
    app.calls.some(([method]) => method === 'delete'),
    false,
  );
});
