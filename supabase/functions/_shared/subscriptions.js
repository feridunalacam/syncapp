// Pure subscription rules shared by Edge Functions and regression tests.
export const EXPIRED_AT = '1970-01-01T00:00:00.000Z';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUserId = (value) => typeof value === 'string' && uuid.test(value);

export function secureEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) mismatch |= (a[i] || 0) ^ (b[i] || 0);
  return mismatch === 0;
}

export function webhookUsers(event) {
  // TRANSFER events have no app_user_id. Refresh both former and new owners.
  const values = event?.type === 'TRANSFER'
    ? [...(event.transferred_from || []), ...(event.transferred_to || [])]
    : [event?.app_user_id];
  return [...new Set(values.filter(isUserId))].slice(0, 50);
}

export function validateWebhook(payload) {
  const event = payload?.event;
  return !!(event && typeof event.id === 'string' && event.id.length > 0 && event.id.length <= 200 &&
    typeof event.type === 'string' && ['SANDBOX', 'PRODUCTION'].includes(event.environment));
}

export function requireRecentSignIn(user, now = Date.now(), maxAgeMs = 15 * 60 * 1000) {
  const signedInAt = Date.parse(user?.last_sign_in_at || '');
  return Number.isFinite(signedInAt) && signedInAt <= now + 60000 && now - signedInAt <= maxAgeMs;
}

export function canonicalEntitlement(customerInfo, {
  entitlementId = 'pro', environment = 'PRODUCTION', now = Date.now(),
} = {}) {
  if (!customerInfo?.subscriber || typeof customerInfo.subscriber !== 'object') {
    throw new Error('RevenueCat returned an invalid customer record.');
  }
  const empty = { entitlement_id: 'pro', expires_at: EXPIRED_AT, store: null, environment };
  const entitlement = customerInfo.subscriber.entitlements?.[entitlementId];
  if (!entitlement || !entitlement.product_identifier) return empty;
  const purchase = customerInfo.subscriber.subscriptions?.[entitlement.product_identifier];
  // This release offers monthly/yearly recurring products only, not lifetime/promotional grants.
  if (!purchase || typeof purchase.is_sandbox !== 'boolean' || purchase.refunded_at) return empty;
  if ((purchase.is_sandbox ? 'SANDBOX' : 'PRODUCTION') !== environment) return empty;
  const expiry = Date.parse(entitlement.expires_date || '');
  const grace = Date.parse(entitlement.grace_period_expires_date || purchase.grace_period_expires_date || '');
  const validUntil = Math.max(Number.isFinite(expiry) ? expiry : 0, Number.isFinite(grace) ? grace : 0);
  if (validUntil <= now) return empty;
  return { ...empty, expires_at: new Date(validUntil).toISOString(), store: purchase.store || null };
}

/** Reserve before fetching, then apply only if no later request superseded this one. */
export async function refreshEntitlement({ userId, eventId = null, begin, fetchCustomer, apply, ...options }) {
  if (!isUserId(userId)) throw new Error('Invalid app user ID.');
  const generation = await begin(userId, eventId);
  if (generation === null) return { duplicate: true, applied: false };
  const customerInfo = await fetchCustomer(userId);
  const entitlement = canonicalEntitlement(customerInfo, options);
  const applied = await apply(userId, generation, entitlement, eventId);
  return { entitlement, applied, duplicate: false };
}
