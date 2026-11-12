import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalEntitlement,
  EXPIRED_AT,
  refreshEntitlement,
  requireRecentSignIn,
  secureEqual,
  validateWebhook,
  webhookUsers,
} from '../supabase/functions/_shared/subscriptions.js';

const USER_A = '10101010-1010-4010-8010-101010101010';
const USER_B = '20202020-2020-4020-8020-202020202020';
const now = Date.parse('2026-11-11T12:00:00Z');
const future = '2026-12-11T12:00:00Z';
function customer(overrides = {}, entitlementOverrides = {}) {
  return {
    subscriber: {
      entitlements: {
        pro: {
          product_identifier: 'sync_pro_monthly',
          expires_date: future,
          ...entitlementOverrides,
        },
      },
      subscriptions: {
        sync_pro_monthly: {
          is_sandbox: false,
          expires_date: future,
          store: 'app_store',
          ...overrides,
        },
      },
    },
  };
}
const canonical = (info, options) => canonicalEntitlement(info, { now, ...options });

test('only the configured recurring entitlement grants Pro', () => {
  assert.equal(canonical(customer()).expires_at, future.replace('Z', '.000Z'));
  assert.equal(canonical({ subscriber: {} }).expires_at, EXPIRED_AT);
  assert.equal(canonical(customer(), { entitlementId: 'unknown' }).expires_at, EXPIRED_AT);
  assert.equal(
    canonical(customer({}, { product_identifier: 'lifetime', expires_date: null })).expires_at,
    EXPIRED_AT,
  );
  assert.throws(() => canonical({ error: 'invalid_key' }), /invalid customer/);
});
test('cancellation preserves paid time; expiration and refund revoke access', () => {
  assert.notEqual(
    canonical(customer({ unsubscribe_detected_at: '2026-11-10T12:00:00Z' })).expires_at,
    EXPIRED_AT,
  );
  assert.equal(
    canonical(customer({}, { expires_date: '2026-11-10T12:00:00Z' })).expires_at,
    EXPIRED_AT,
  );
  assert.equal(canonical(customer({ refunded_at: '2026-11-11T11:00:00Z' })).expires_at, EXPIRED_AT);
});
test('billing grace period extends access without accepting malformed expiry', () => {
  assert.equal(
    canonical(
      customer(
        {},
        {
          expires_date: '2026-11-10T12:00:00Z',
          grace_period_expires_date: future,
        },
      ),
    ).expires_at,
    future.replace('Z', '.000Z'),
  );
  assert.equal(canonical(customer({}, { expires_date: 'garbage' })).expires_at, EXPIRED_AT);
});
test('sandbox receipts never grant access in a production backend', () => {
  assert.equal(canonical(customer({ is_sandbox: true })).expires_at, EXPIRED_AT);
  assert.notEqual(
    canonical(customer({ is_sandbox: true }), { environment: 'SANDBOX' }).expires_at,
    EXPIRED_AT,
  );
  assert.equal(canonical(customer({ is_sandbox: undefined })).expires_at, EXPIRED_AT);
});
test('webhooks need bounded IDs and a known environment except for environmentless transfers', () => {
  assert.equal(
    validateWebhook({ event: { id: 'event1', type: 'RENEWAL', environment: 'PRODUCTION' } }),
    true,
  );
  assert.equal(
    validateWebhook({
      event: {
        id: 'transfer1',
        type: 'TRANSFER',
        transferred_from: [USER_A],
        transferred_to: [USER_B],
      },
    }),
    true,
  );
  for (const value of [
    null,
    {},
    { event: { id: '', type: 'RENEWAL', environment: 'PRODUCTION' } },
    { event: { id: 'e', type: 'RENEWAL', environment: 'DEV' } },
    { event: { id: 'e', type: 'RENEWAL' } },
    { event: { id: 'e', type: 'TRANSFER', environment: 'DEV' } },
    { event: { id: 'e', type: 'TRANSFER', transferred_from: USER_A } },
  ])
    assert.equal(validateWebhook(value), false);
});
test('Supabase UUID aliases and original identities are refreshed when the last-seen ID is anonymous', () => {
  assert.deepEqual(
    webhookUsers({
      type: 'RENEWAL',
      app_user_id: '$RCAnonymousID:abc',
      original_app_user_id: USER_A,
      aliases: [USER_A, USER_B],
    }),
    [USER_A, USER_B],
  );
  assert.deepEqual(webhookUsers({ type: 'RENEWAL', app_user_id: USER_A, aliases: [USER_B] }), [
    USER_A,
    USER_B,
  ]);
  assert.deepEqual(
    webhookUsers({
      type: 'TRANSFER',
      transferred_from: [USER_A, '$RCAnonymousID:abc'],
      transferred_to: [USER_B, USER_A],
    }),
    [USER_A, USER_B],
  );
  assert.deepEqual(webhookUsers({ app_user_id: 'untrusted/arbitrary' }), []);
  assert.deepEqual(webhookUsers({ aliases: 'malformed' }), []);
});
test('webhook authentication rejects missing, shortened and mismatched secrets', () => {
  assert.equal(secureEqual('Bearer secret', 'Bearer secret'), true);
  for (const value of [null, 'Bearer secre', 'bearer secret', 'Bearer xxxxxx']) {
    assert.equal(secureEqual(value, 'Bearer secret'), false);
  }
});
test('account deletion requires recent authentication in this verified session', () => {
  const claims = (method, timestamp) => ({
    sub: USER_A,
    session_id: USER_B,
    amr: [{ method, timestamp: Date.parse(timestamp) / 1000 }],
  });
  assert.equal(requireRecentSignIn(claims('password', '2026-11-11T11:55:00Z'), now), true);
  assert.equal(requireRecentSignIn(claims('oauth', '2026-11-11T11:55:00Z'), now), true);
  assert.equal(requireRecentSignIn(claims('recovery', '2026-11-11T11:55:00Z'), now), true);
  assert.equal(requireRecentSignIn(claims('password', '2026-11-11T11:00:00Z'), now), false);
  assert.equal(requireRecentSignIn(claims('password', '2026-11-12T11:00:00Z'), now), false);
  assert.equal(requireRecentSignIn(claims('token_refresh', '2026-11-11T11:55:00Z'), now), false);
  assert.equal(requireRecentSignIn(claims('anonymous', '2026-11-11T11:55:00Z'), now), false);
  assert.equal(
    requireRecentSignIn({ ...claims('password', '2026-11-11T11:55:00Z'), session_id: null }, now),
    false,
  );
  assert.equal(requireRecentSignIn({ last_sign_in_at: '2026-11-11T11:55:00Z' }, now), false);
  assert.equal(requireRecentSignIn({}, now), false);
});
test('duplicate completed event avoids another canonical lookup or write', async () => {
  const result = await refreshEntitlement({
    userId: USER_A,
    begin: async () => null,
    fetchCustomer: () => assert.fail('duplicate must not fetch'),
    apply: () => assert.fail('duplicate must not write'),
  });
  assert.equal(result.duplicate, true);
});
test('late older canonical request cannot overwrite a newer subscription state', async () => {
  let sequence = 0;
  let saved;
  let release;
  const begin = async () => ++sequence;
  const apply = async (_id, generation, state) => {
    if (generation !== sequence) return false;
    saved = state;
    return true;
  };
  const earlier = refreshEntitlement({
    userId: USER_A,
    now,
    begin,
    apply,
    fetchCustomer: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  await new Promise(setImmediate);
  const newer = await refreshEntitlement({
    userId: USER_A,
    now,
    begin,
    apply,
    fetchCustomer: async () => customer({ refunded_at: '2026-11-11T11:59:00Z' }),
  });
  release(customer());
  assert.equal((await earlier).applied, false);
  assert.equal(newer.applied, true);
  assert.equal(saved.expires_at, EXPIRED_AT);
});
test('upstream failures never overwrite a previously verified subscription', async () => {
  let writes = 0;
  await assert.rejects(
    refreshEntitlement({
      userId: USER_A,
      begin: async () => 1,
      fetchCustomer: async () => {
        throw new Error('timeout');
      },
      apply: async () => {
        writes++;
      },
    }),
    /timeout/,
  );
  assert.equal(writes, 0);
});
