import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';
import { createRequire } from 'node:module';
import * as rules from '../supabase/functions/_shared/subscriptions.js';
import * as reviewRules from '../supabase/functions/_shared/review-subscriptions.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const USER_A = '10101010-1010-4010-8010-101010101010';
const USER_B = '20202020-2020-4020-8020-202020202020';
const USER_DELETED = '30303030-3030-4030-8030-303030303030';
const NOW = Date.now();
const future = new Date(NOW + 60 * 60 * 1000).toISOString();
const productionScope = (id) => ({
  user_id: id,
  lane: 'production',
  namespace: id,
  epoch: 0,
  active: true,
  expires_at: null,
});
const reviewScope = (id, overrides = {}) => ({
  user_id: id,
  lane: 'review',
  namespace: `review:1:${id}`,
  epoch: 1,
  active: true,
  expires_at: future,
  ...overrides,
});
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
  ['delete-account', 'sync-subscription', 'revenuecat-webhook', 'revenuecat-review-webhook'].map(
    (name) => [name, compile(`${name}/index.ts`)],
  ),
);

function harness(name, options = {}) {
  const calls = [];
  let handler;
  let saved = null;
  const scopes = new Map(Object.entries(options.scopes || {}));
  const reviewSaved = new Map();
  const generations = new Map();
  const reviewEvents = new Set();
  const env = {
    SUPABASE_URL: 'https://fixture.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key',
    REVENUECAT_SECRET_API_KEY: 'fixture-revenuecat-key',
    REVENUECAT_WEBHOOK_SECRET: 'fixture-webhook-secret',
    REVENUECAT_ENVIRONMENT: 'PRODUCTION',
    REVENUECAT_ENTITLEMENT_ID: 'sync_pro',
    REVENUECAT_REVIEW_SECRET_API_KEY: 'fixture-review-revenuecat-key',
    REVENUECAT_REVIEW_WEBHOOK_SECRET: 'fixture-review-webhook-secret',
    ...options.env,
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
      if (method === 'get_account_billing_scope_for_user') {
        if (options.scopeError) return { data: null, error: { message: 'Scope unavailable' } };
        if (options.unregistered?.includes(args.target_user_id) && !args.create_production)
          return { data: null, error: null };
        return {
          data: scopes.get(args.target_user_id) || productionScope(args.target_user_id),
          error: null,
        };
      }
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
      if (method === 'begin_review_subscription_sync') {
        const scope = scopes.get(args.target_user_id);
        if (
          !scope?.active ||
          scope.lane !== 'review' ||
          Date.parse(scope.expires_at) <= Date.now() ||
          scope.namespace !== args.review_namespace ||
          scope.epoch !== args.review_epoch
        )
          return { data: null, error: { code: '42501' } };
        const key = `${args.target_user_id}/${args.review_namespace}`;
        if (args.webhook_event_id && reviewEvents.has(`${key}/${args.webhook_event_id}`))
          return { data: null, error: null };
        const generation = (generations.get(key) || 0) + 1;
        generations.set(key, generation);
        return { data: generation, error: null };
      }
      if (method === 'apply_review_subscription_sync') {
        const scope = scopes.get(args.target_user_id);
        const key = `${args.target_user_id}/${args.review_namespace}`;
        if (
          !scope?.active ||
          Date.parse(scope.expires_at) <= Date.now() ||
          scope.namespace !== args.review_namespace ||
          scope.epoch !== args.review_epoch ||
          generations.get(key) !== args.sync_generation ||
          options.superseded
        )
          return { data: false, error: null };
        reviewSaved.set(args.target_user_id, {
          entitlement_id: 'pro',
          expires_at: args.valid_until,
          store: args.purchase_store,
          environment: args.purchase_environment,
          namespace: args.review_namespace,
          epoch: args.review_epoch,
          product_id: args.purchase_product_id,
        });
        await options.onReviewApply?.(args.target_user_id, { scopes });
        if (args.webhook_event_id) reviewEvents.add(`${key}/${args.webhook_event_id}`);
        return { data: true, error: null };
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
      assert.ok(['entitlements', 'review_entitlements'].includes(table));
      const filters = {};
      const query = {
        select: () => query,
        eq: (key, value) => {
          filters[key] = value;
          return query;
        },
        maybeSingle: async () => ({
          data: table === 'entitlements' ? saved : reviewSaved.get(filters.user_id) || null,
          error: null,
        }),
      };
      return query;
    },
  };
  const context = createContext({
    ...rules,
    ...reviewRules,
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
    fetch: async (url, init) => {
      const id = decodeURIComponent(url.split('/').at(-1));
      calls.push(['customer', id]);
      calls.push(['customer-key', init.headers.Authorization]);
      await options.onCustomer?.(id, { scopes });
      if (options.upstreamFailure) return new Response('{}', { status: 503 });
      const record = options.customers?.[id] || customer();
      return new Response(JSON.stringify(record), { status: 200 });
    },
  });
  new Script(`${sharedCode}\n${handlerCode[name]}`).runInContext(context);
  return {
    calls,
    scopes,
    request: (
      body = {},
      authorization = name === 'revenuecat-webhook'
        ? 'Bearer fixture-webhook-secret'
        : name === 'revenuecat-review-webhook'
          ? 'Bearer fixture-review-webhook-secret'
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

const reviewCustomer = () => ({
  subscriber: {
    entitlements: {
      sync_pro: { product_identifier: reviewRules.REVIEW_PRODUCTS[0], expires_date: future },
    },
    subscriptions: {
      [reviewRules.REVIEW_PRODUCTS[0]]: {
        is_sandbox: true,
        store: 'app_store',
        expires_date: future,
      },
    },
  },
});
const transfer = (id = 'review-transfer') => ({
  event: {
    id,
    type: 'TRANSFER',
    transferred_from: [USER_A],
    transferred_to: [USER_B],
  },
});

test('authenticated review sync uses only the separate server key and returns the exact scope', async () => {
  const app = harness('sync-subscription', {
    scopes: { [USER_A]: reviewScope(USER_A) },
    customers: { [USER_A]: reviewCustomer() },
  });
  const response = await app.request({
    user_id: USER_B,
    lane: 'production',
    namespace: USER_B,
    active: true,
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.scope, reviewScope(USER_A));
  assert.equal(body.entitlement.environment, 'SANDBOX');
  assert.equal(body.entitlement.namespace, reviewScope(USER_A).namespace);
  assert.ok(Date.parse(body.entitlement.expires_at) <= Date.now() + reviewRules.REVIEW_LEASE_MS);
  assert.deepEqual(
    app.calls.filter(([method]) => method === 'customer-key'),
    [['customer-key', 'Bearer fixture-review-revenuecat-key']],
  );
  assert.equal(
    app.calls.some(([method]) => method === 'apply_subscription_sync'),
    false,
  );
});

test('inactive, expired and unknown scopes cannot select production or call RevenueCat', async () => {
  for (const scope of [
    reviewScope(USER_A, { active: false }),
    reviewScope(USER_A, { expires_at: new Date(NOW - 1000).toISOString() }),
  ]) {
    const app = harness('sync-subscription', { scopes: { [USER_A]: scope } });
    const response = await app.request({ lane: 'production' });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.scope.lane, 'review');
    assert.equal(body.scope.active, false);
    assert.equal(body.entitlement, null);
    assert.equal(
      app.calls.some(([method]) => method === 'customer'),
      false,
    );
  }
  for (const options of [
    { scopeError: true },
    { scopes: { [USER_A]: { ...reviewScope(USER_A), user_id: USER_B } } },
  ]) {
    const app = harness('sync-subscription', options);
    assert.equal((await app.request()).status, 503);
    assert.equal(
      app.calls.some(([method]) => method === 'customer'),
      false,
    );
  }
});

test('missing or shared review configuration fails closed before any verification write', async () => {
  for (const env of [
    { REVENUECAT_REVIEW_SECRET_API_KEY: undefined },
    { REVENUECAT_REVIEW_WEBHOOK_SECRET: undefined },
    { REVENUECAT_REVIEW_SECRET_API_KEY: 'fixture-revenuecat-key' },
    { REVENUECAT_REVIEW_WEBHOOK_SECRET: 'fixture-webhook-secret' },
  ]) {
    const app = harness('sync-subscription', { scopes: { [USER_A]: reviewScope(USER_A) }, env });
    assert.equal((await app.request()).status, 503);
    assert.equal(
      app.calls.some(([method]) => method === 'begin_review_subscription_sync'),
      false,
    );
    assert.equal(
      app.calls.some(([method]) => method === 'customer'),
      false,
    );
  }
});

test('revocation or expiry while the canonical request is in flight cannot apply or fall back', async () => {
  for (const change of [{ active: false }, { expires_at: new Date(NOW - 1).toISOString() }]) {
    const app = harness('sync-subscription', {
      scopes: { [USER_A]: reviewScope(USER_A) },
      customers: { [USER_A]: reviewCustomer() },
      onCustomer: async (id, { scopes }) => scopes.set(id, { ...scopes.get(id), ...change }),
    });
    assert.equal((await app.request()).status, 409);
    assert.equal(
      app.calls.some(([method]) => method === 'apply_subscription_sync'),
      false,
    );
  }
});

test('review webhook never uses production identity, key or writes, even for environmentless transfers', async () => {
  const app = harness('revenuecat-review-webhook', {
    scopes: { [USER_A]: reviewScope(USER_A), [USER_B]: productionScope(USER_B) },
    customers: { [USER_A]: reviewCustomer() },
  });
  assert.equal((await app.request(transfer())).status, 200);
  assert.deepEqual(
    app.calls.filter(([method]) => method === 'customer').map(([, id]) => id),
    [USER_A],
  );
  assert.equal(
    app.calls.some(([method]) => method === 'apply_subscription_sync'),
    false,
  );
  assert.ok(
    app.calls
      .filter(([method]) => method === 'get_account_billing_scope_for_user')
      .every(([, args]) => args.create_production === false),
  );
  const prod = harness('revenuecat-webhook', { scopes: { [USER_A]: reviewScope(USER_A) } });
  assert.equal((await prod.request(transfer())).status, 200);
  assert.deepEqual(
    prod.calls.filter(([method]) => method === 'customer').map(([, id]) => id),
    [USER_B],
  );
});

test('review transfer revokes the former canonical owner, grants only the reserved destination, and deduplicates', async () => {
  const app = harness('revenuecat-review-webhook', {
    scopes: { [USER_A]: reviewScope(USER_A), [USER_B]: reviewScope(USER_B) },
    customers: { [USER_A]: { subscriber: {} }, [USER_B]: reviewCustomer() },
  });
  assert.equal((await app.request(transfer())).status, 200);
  const writes = app.calls.filter(([method]) => method === 'apply_review_subscription_sync');
  assert.equal(writes.length, 2);
  assert.equal(writes[0][1].valid_until, rules.EXPIRED_AT);
  assert.ok(Date.parse(writes[1][1].valid_until) > Date.now());
  assert.equal((await app.request(transfer())).status, 200);
  assert.equal(app.calls.filter(([method]) => method === 'customer').length, 2);
  assert.equal(
    app.calls.some(([method]) => /backup/i.test(method)),
    false,
  );
});

test('wrong-environment and unreserved review events are ignored without creating scopes', async () => {
  const prodEvent = harness('revenuecat-review-webhook');
  assert.equal(
    (
      await prodEvent.request({
        event: { id: 'prod', type: 'RENEWAL', environment: 'PRODUCTION', app_user_id: USER_A },
      })
    ).status,
    200,
  );
  assert.deepEqual(prodEvent.calls, []);
  const unregistered = harness('revenuecat-review-webhook', { unregistered: [USER_A, USER_B] });
  assert.equal((await unregistered.request(transfer())).status, 200);
  assert.equal(
    unregistered.calls.some(([method]) => method === 'customer'),
    false,
  );
});

test('review canonical upstream failure does not write and cannot grant production access', async () => {
  const app = harness('sync-subscription', {
    scopes: { [USER_A]: reviewScope(USER_A) },
    upstreamFailure: true,
  });
  assert.equal((await app.request()).status, 503);
  assert.equal(
    app.calls.some(([method]) => method.startsWith('apply_')),
    false,
  );
});

test('a rejected production receipt returns an explicit error while persisting only an inactive review record', async () => {
  const record = reviewCustomer();
  record.subscriber.subscriptions.oldProduction = { is_sandbox: false, store: 'app_store' };
  const app = harness('sync-subscription', {
    scopes: { [USER_A]: reviewScope(USER_A) },
    customers: { [USER_A]: record },
  });
  const response = await app.request();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.verification_error, 'review_purchase_not_eligible');
  assert.equal(body.entitlement.expires_at, rules.EXPIRED_AT);
  assert.equal(body.scope.lane, 'review');
  assert.equal(
    app.calls.some(([method]) => method === 'apply_subscription_sync'),
    false,
  );
});

test('a later review request supersedes a held canonical response without overwriting its grant', async () => {
  let release;
  let entered;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  let requests = 0;
  const app = harness('sync-subscription', {
    scopes: { [USER_A]: reviewScope(USER_A) },
    customers: { [USER_A]: reviewCustomer() },
    onCustomer: async () => {
      if (++requests === 1) {
        entered();
        await held;
      }
    },
  });
  const older = app.request();
  await started;
  const newer = await app.request();
  assert.equal(newer.status, 200);
  release();
  assert.equal((await older).status, 409);
  const writes = app.calls.filter(([method]) => method === 'apply_review_subscription_sync');
  assert.deepEqual(
    writes.map(([, args]) => args.sync_generation),
    [2, 1],
  );
});

test('revocation after apply but before response returns inactive review scope and no entitlement', async () => {
  const app = harness('sync-subscription', {
    scopes: { [USER_A]: reviewScope(USER_A) },
    customers: { [USER_A]: reviewCustomer() },
    onReviewApply: async (id, { scopes }) => scopes.set(id, { ...scopes.get(id), active: false }),
  });
  const response = await app.request();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.scope.active, false);
  assert.equal(body.entitlement, null);
});
