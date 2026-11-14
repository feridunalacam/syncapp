import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import {
  createAccountScopeResolver,
  createBillingScopeRegistry,
  parseBillingScope,
} from '../src/lib/accountBillingScope.js';
import { verifyAccountEntitlement } from '../src/services/subscriptions/accountAccess.js';
import { createAccountBackupRemote } from '../src/lib/accountBackupRemote.js';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const production = (id = A) => ({
  user_id: id,
  lane: 'production',
  namespace: id,
  epoch: 0,
  active: true,
  expires_at: null,
});
const review = (id = A) => ({
  user_id: id,
  lane: 'review',
  namespace: `review:1:${id}`,
  epoch: 1,
  active: true,
  expires_at: '2099-01-01T00:00:00Z',
});
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { resolve, promise };
};
const settle = () => new Promise(setImmediate);
function storage(beforeWrite = async () => {}) {
  const values = new Map();
  return {
    values,
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      await beforeWrite();
      values.set(key, value);
    },
    removeItem: async (key) => values.delete(key),
  };
}
function realClient(handle, userId = A) {
  const requests = [];
  const client = createClient(
    'https://billing-scope-fixture.invalid',
    'sb_publishable_offline_fixture',
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: async (input, options) => {
          const url = new URL(input.toString());
          requests.push({ path: url.pathname, params: url.searchParams, options });
          return handle(url, options);
        },
      },
    },
  );
  client.auth.getSession = async () => ({
    data: { session: { user: { id: userId }, access_token: 'offline-session-only' } },
    error: null,
  });
  return { client, requests };
}
const response = (data) =>
  new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });

test('scope parser rejects arrays, identity/namespace substitution and malformed review leases', () => {
  assert.deepEqual(parseBillingScope(production(), A), production());
  for (const value of [
    [production()],
    production(B),
    { ...review(), namespace: A },
    { ...review(), epoch: 2 },
    { ...review(), expires_at: null },
    { ...production(), active: false },
  ]) {
    assert.throws(() => parseBillingScope(value, A), /Account access/);
  }
});

test('confirmed local namespace cannot reclassify, extend review expiry or reenable a revoked reservation', async () => {
  const base = storage();
  const registry = createBillingScopeRegistry(base);
  await registry.confirm(production());
  await assert.rejects(registry.confirm(review()), /access changed/);
  await registry.confirm(review(B));
  await assert.rejects(
    registry.confirm({ ...review(B), expires_at: '2099-02-01T00:00:00Z' }),
    /access changed/,
  );
  await registry.confirm({ ...review(B), active: false });
  await assert.rejects(registry.confirm(review(B)), /access changed/);
  assert.equal((await registry.load(B)).namespace, review(B).namespace);
});

test('confirmed deletion drains a held registry save before forgetting and rejects late resurrection', async () => {
  const hold = deferred();
  const entered = deferred();
  const base = storage(async () => {
    entered.resolve();
    await hold.promise;
  });
  const registry = createBillingScopeRegistry(base);
  const pending = registry.confirm(review());
  await entered.promise;
  registry.invalidate(A);
  const namespaces = registry.namespaces(A);
  const forgotten = registry.forget(A);
  hold.resolve();
  await assert.rejects(pending, /Account access/);
  assert.deepEqual(await namespaces, [review().namespace, `unresolved:${A}`]);
  await forgotten;
  await assert.rejects(registry.confirm(review()), /Account access/);
  assert.equal(base.values.size, 0);
});

test('actual Supabase RPC returns one JSON object, binds the captured session and persists only scope metadata', async () => {
  const base = storage();
  const registry = createBillingScopeRegistry(base);
  const { client, requests } = realClient(() => response(review()));
  const resolve = createAccountScopeResolver({ client, registry });
  assert.deepEqual(await resolve(A), review());
  assert.equal(requests[0].path, '/rest/v1/rpc/get_account_billing_scope');
  assert.equal(
    new Headers(requests[0].options.headers).get('Authorization'),
    'Bearer offline-session-only',
  );
  assert.deepEqual(JSON.parse(requests[0].options.body), {});
  assert.deepEqual(await registry.load(A), review());
  assert.equal(
    [...base.values.values()].some((value) => value.includes('offline-session-only')),
    false,
  );
});

test('late account scope and an abort-ignoring transport cannot populate cache after identity change or deadline', async () => {
  const pending = deferred();
  const base = storage();
  const registry = createBillingScopeRegistry(base);
  let current = true;
  const { client } = realClient(() => pending.promise);
  const resolve = createAccountScopeResolver({ client, registry, timeoutMs: 12000 });
  const rejected = assert.rejects(resolve(A, { isCurrent: () => current }), /Account access/);
  await settle();
  current = false;
  pending.resolve(response(review()));
  await rejected;
  assert.equal(base.values.size, 0);
  const late = deferred();
  const stalled = realClient(() => late.promise);
  await assert.rejects(
    createAccountScopeResolver({ client: stalled.client, registry, timeoutMs: 5 })(A),
    /Account access/,
  );
  late.resolve(response(review()));
  await settle();
  assert.equal(base.values.size, 0);
});

test('real query builders route review entitlement and backup reads/writes exclusively through bound review paths', async () => {
  const scope = review();
  const routes = [];
  const { client, requests } = realClient((url, options) => {
    routes.push(url.pathname);
    if (url.pathname === '/functions/v1/sync-subscription')
      return response({ scope, entitlement: null });
    if (url.pathname.endsWith('/review_entitlements'))
      return response({ entitlement_id: 'pro', namespace: scope.namespace, epoch: 1 });
    if (url.pathname.endsWith('/review_backups'))
      return response({ namespace: scope.namespace, epoch: 1, payload: {}, revision: 2 });
    if (url.pathname.endsWith('/save_review_account_backup')) {
      assert.deepEqual(JSON.parse(options.body), {
        expected_revision: 2,
        backup_payload: { version: 1 },
        backup_user_id: A,
        backup_namespace: scope.namespace,
        backup_epoch: 1,
      });
      return response({ revision: 3 });
    }
    assert.fail(`Unexpected path ${url.pathname}`);
  });
  await verifyAccountEntitlement(client, A, { scope, sync: true });
  const remote = createAccountBackupRemote({
    client,
    scope,
    getSession: () => ({ user: { id: A }, access_token: 'captured-fixture' }),
    isCurrent: () => true,
  });
  assert.equal((await remote.read()).revision, 2);
  assert.equal((await remote.write({ version: 1 }, 2)).revision, 3);
  assert.deepEqual(routes, [
    '/functions/v1/sync-subscription',
    '/rest/v1/review_entitlements',
    '/rest/v1/review_backups',
    '/rest/v1/rpc/save_review_account_backup',
  ]);
  for (const req of requests.filter(
    (entry) => !entry.path.includes('/rpc/') && entry.path.startsWith('/rest/'),
  )) {
    assert.equal(req.params.get('namespace'), `eq.${scope.namespace}`);
    assert.equal(req.params.get('epoch'), 'eq.1');
  }
});

test('production backup API keeps legacy table/RPC parameters; stale identity prevents a returned cloud copy', async () => {
  let current = true;
  const pending = deferred();
  const { client, requests } = realClient((url, options) => {
    if (url.pathname.endsWith('/save_account_backup')) {
      assert.deepEqual(JSON.parse(options.body), {
        expected_revision: 0,
        backup_payload: { version: 1 },
        backup_user_id: A,
      });
      return response({ revision: 1 });
    }
    assert.equal(url.pathname, '/rest/v1/account_backups');
    return pending.promise;
  });
  const remote = createAccountBackupRemote({
    client,
    scope: production(),
    getSession: () => ({ user: { id: A }, access_token: 'captured-fixture' }),
    isCurrent: () => current,
  });
  await remote.write({ version: 1 }, 0);
  const read = remote.read();
  await settle();
  current = false;
  pending.resolve(response({ payload: {}, revision: 1 }));
  await assert.rejects(read, /account changed/);
  assert.equal(requests[1].params.has('namespace'), false);
});

test('inactive review cannot invoke SDK-independent entitlement or backup paths', async () => {
  const { client, requests } = realClient(() =>
    assert.fail('Inactive scope must not request cloud data'),
  );
  const scope = { ...review(), active: false };
  await assert.rejects(verifyAccountEntitlement(client, A, { scope, sync: true }), /unavailable/);
  const remote = createAccountBackupRemote({
    client,
    scope,
    getSession: () => ({ user: { id: A } }),
    isCurrent: () => true,
  });
  await assert.rejects(remote.read(), /account changed/);
  assert.equal(requests.length, 0);
});

test('canonical review rejection is explicit and a successful later verification can clear it', async () => {
  let rejected = true;
  const scope = review();
  const { client } = realClient((url) =>
    url.pathname.includes('/functions/')
      ? response({
          scope,
          entitlement: null,
          ...(rejected ? { verification_error: 'review_purchase_not_eligible' } : {}),
        })
      : response(null),
  );
  assert.equal(
    (await verifyAccountEntitlement(client, A, { scope, sync: true })).verificationError,
    'review_purchase_not_eligible',
  );
  assert.equal((await verifyAccountEntitlement(client, A, { scope })).verificationError, undefined);
  rejected = false;
  assert.equal(
    (await verifyAccountEntitlement(client, A, { scope, sync: true })).verificationError,
    null,
  );
});
