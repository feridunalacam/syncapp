import test from 'node:test';
import assert from 'node:assert/strict';
import {
  billingScope,
  canonicalReviewEntitlement,
  REVIEW_LEASE_MS,
  REVIEW_PRODUCTS,
} from '../supabase/functions/_shared/review-subscriptions.js';
import { EXPIRED_AT } from '../supabase/functions/_shared/subscriptions.js';

const userId = '10101010-1010-4010-8010-101010101010';
const now = Date.parse('2026-11-12T12:00:00Z');
const iso = (offset) => new Date(now + offset).toISOString();
const scope = (changes = {}) => ({
  user_id: userId,
  lane: 'review',
  namespace: `review:1:${userId}`,
  epoch: 1,
  active: true,
  expires_at: iso(60 * 60 * 1000),
  ...changes,
});
const customer = (purchase = {}, entitlement = {}) => ({
  subscriber: {
    entitlements: {
      sync_pro: {
        product_identifier: REVIEW_PRODUCTS[0],
        expires_date: iso(30 * 60 * 1000),
        ...entitlement,
      },
    },
    subscriptions: {
      [REVIEW_PRODUCTS[0]]: {
        is_sandbox: true,
        store: 'app_store',
        expires_date: iso(30 * 60 * 1000),
        ...purchase,
      },
    },
  },
});
const verify = (value, reservation = scope()) =>
  canonicalReviewEntitlement(value, reservation, { now });

test('scope validation binds the exact authenticated UUID, lane, namespace and immutable epoch', () => {
  assert.equal(billingScope(scope(), userId, now).lane, 'review');
  assert.equal(
    billingScope(
      {
        user_id: userId,
        lane: 'production',
        namespace: userId,
        epoch: 0,
        active: true,
        expires_at: null,
      },
      userId,
      now,
    ).active,
    true,
  );
  for (const changes of [
    { user_id: '20202020-2020-4020-8020-202020202020' },
    { namespace: userId },
    { namespace: `review:2:${userId}`, epoch: 2 },
    { lane: 'sandbox' },
    { active: 'true' },
    { expires_at: null },
    { expires_at: 'invalid' },
    { epoch: '1' },
  ])
    assert.throws(() => billingScope(scope(changes), userId, now), /Invalid billing scope/);
  for (const value of [null, [], {}]) assert.throws(() => billingScope(value, userId, now));
});

test('review lease is bounded independently by canonical expiry, five minutes and reservation expiry', () => {
  assert.equal(verify(customer()).expires_at, iso(REVIEW_LEASE_MS));
  assert.equal(verify(customer({}, { expires_date: iso(30 * 1000) })).expires_at, iso(30 * 1000));
  assert.equal(
    verify(customer(), scope({ expires_at: iso(15 * 1000) })).expires_at,
    iso(15 * 1000),
  );
  assert.equal(verify(customer()).canonical_expires_at, iso(30 * 60 * 1000));
  assert.equal(verify(customer()).product_id, REVIEW_PRODUCTS[0]);
});

test('expired and terminally revoked reservations never reopen from a valid canonical purchase', () => {
  for (const reservation of [scope({ active: false }), scope({ expires_at: iso(-1) })]) {
    assert.equal(billingScope(reservation, userId, now).active, false);
    assert.equal(verify(customer(), reservation).expires_at, EXPIRED_AT);
  }
});

test('review accepts only the exact configured Apple sandbox recurring products', () => {
  for (const purchase of [
    { is_sandbox: false },
    { is_sandbox: undefined },
    { is_sandbox: 'true' },
    { store: 'test_store' },
    { store: 'promotional' },
    { store: 'APP_STORE' },
    { store: 'play_store' },
    { store: undefined },
    { refunded_at: iso(-1) },
  ])
    assert.equal(verify(customer(purchase)).expires_at, EXPIRED_AT);
  for (const identifier of [
    'lifetime',
    'sync_pro_monthly',
    null,
    'com.feridun.syncapp.pro.monthly.extra',
  ])
    assert.equal(verify(customer({}, { product_identifier: identifier })).expires_at, EXPIRED_AT);
  const yearly = customer();
  yearly.subscriber.entitlements.sync_pro.product_identifier = REVIEW_PRODUCTS[1];
  yearly.subscriber.subscriptions[REVIEW_PRODUCTS[1]] =
    yearly.subscriber.subscriptions[REVIEW_PRODUCTS[0]];
  delete yearly.subscriber.subscriptions[REVIEW_PRODUCTS[0]];
  assert.equal(verify(yearly).product_id, REVIEW_PRODUCTS[1]);
});

test('manual/lifetime grants and missing entitlement do not become review Pro', () => {
  for (const subscriber of [
    {},
    {
      entitlements: {
        sync_pro: { product_identifier: REVIEW_PRODUCTS[0], expires_date: iso(999999) },
      },
    },
    { ...customer().subscriber, subscriptions: {} },
    {
      ...customer().subscriber,
      entitlements: { pro: customer().subscriber.entitlements.sync_pro },
    },
  ])
    assert.equal(verify({ subscriber }).expires_at, EXPIRED_AT);
  assert.throws(() => verify({ error: 'invalid_key' }), /Invalid review customer/);
});

test('mixed production/sandbox customer records are quarantined instead of falling back to sandbox', () => {
  const mixed = customer();
  mixed.subscriber.subscriptions.olderProduction = { is_sandbox: false, store: 'app_store' };
  const result = verify(mixed);
  assert.equal(result.expires_at, EXPIRED_AT);
  assert.equal(result.rejection, 'production_receipt_in_review');
});
