import { canonicalEntitlement, EXPIRED_AT, isUserId } from './subscriptions.js';

export const REVIEW_LEASE_MS = 5 * 60 * 1000;
export const REVIEW_PRODUCTS = Object.freeze([
  'com.feridun.syncapp.pro.monthly',
  'com.feridun.syncapp.pro.yearly',
]);

// This is a validation boundary for a database result, never a client-selected lane.
export function billingScope(value, userId, now = Date.now()) {
  if (
    !isUserId(userId) ||
    !value ||
    Array.isArray(value) ||
    value.user_id !== userId ||
    typeof value.active !== 'boolean'
  )
    throw new Error('Invalid billing scope.');
  const production =
    value.lane === 'production' &&
    value.epoch === 0 &&
    value.namespace === userId &&
    value.expires_at === null &&
    value.active === true;
  const review =
    value.lane === 'review' &&
    value.epoch === 1 &&
    value.namespace === `review:1:${userId}` &&
    typeof value.expires_at === 'string' &&
    Number.isFinite(Date.parse(value.expires_at));
  if (!production && !review) throw new Error('Invalid billing scope.');
  return {
    user_id: userId,
    lane: value.lane,
    namespace: value.namespace,
    epoch: value.epoch,
    active: production || (value.active && Date.parse(value.expires_at) > now),
    expires_at: value.expires_at,
  };
}

export function canonicalReviewEntitlement(customerInfo, scope, { now = Date.now() } = {}) {
  const trusted = billingScope(scope, scope?.user_id, now);
  if (trusted.lane !== 'review') throw new Error('A review scope is required.');
  const empty = {
    entitlement_id: 'pro',
    expires_at: EXPIRED_AT,
    canonical_expires_at: EXPIRED_AT,
    store: 'app_store',
    environment: 'SANDBOX',
    product_id: null,
  };
  if (!trusted.active) return empty;
  if (
    !customerInfo?.subscriber ||
    typeof customerInfo.subscriber !== 'object' ||
    Array.isArray(customerInfo.subscriber)
  )
    throw new Error('Invalid review customer record.');
  const subscriber = customerInfo.subscriber;
  const subscriptions = subscriber.subscriptions || {};
  // A review identity is never a route for importing/validating production receipts.
  if (Object.values(subscriptions).some((purchase) => purchase?.is_sandbox === false))
    return { ...empty, rejection: 'production_receipt_in_review' };
  const product = subscriber.entitlements?.sync_pro?.product_identifier;
  const purchase = subscriptions[product];
  if (
    !REVIEW_PRODUCTS.includes(product) ||
    purchase?.is_sandbox !== true ||
    purchase.store !== 'app_store'
  )
    return empty;
  const canonical = canonicalEntitlement(customerInfo, {
    entitlementId: 'sync_pro',
    environment: 'SANDBOX',
    now,
  });
  const canonicalExpiry = Date.parse(canonical.expires_at);
  if (canonicalExpiry <= now) return empty;
  return {
    ...empty,
    product_id: product,
    canonical_expires_at: canonical.expires_at,
    expires_at: new Date(
      Math.min(canonicalExpiry, now + REVIEW_LEASE_MS, Date.parse(trusted.expires_at)),
    ).toISOString(),
  };
}
