const PREFIX = '@syncapp/billing-scope/';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const registries = new WeakMap();
const unavailable = () =>
  new Error('Account access could not be checked. Your records remain on this device.');

export function parseBillingScope(value, userId) {
  if (
    !UUID.test(userId || '') ||
    !value ||
    Array.isArray(value) ||
    value.user_id !== userId ||
    !['production', 'review'].includes(value.lane) ||
    !Number.isSafeInteger(value.epoch) ||
    typeof value.active !== 'boolean'
  )
    throw unavailable();
  if (value.lane === 'production') {
    if (
      value.namespace !== userId ||
      value.epoch !== 0 ||
      !value.active ||
      value.expires_at !== null
    )
      throw unavailable();
  } else if (
    value.epoch !== 1 ||
    value.namespace !== `review:1:${userId}` ||
    typeof value.expires_at !== 'string' ||
    !Number.isFinite(Date.parse(value.expires_at))
  ) {
    throw unavailable();
  }
  return Object.freeze({
    user_id: userId,
    lane: value.lane,
    namespace: value.namespace,
    epoch: value.epoch,
    active: value.active,
    expires_at: value.expires_at,
  });
}

export const sameBillingScope = (a, b) =>
  !!a &&
  !!b &&
  a.user_id === b.user_id &&
  a.lane === b.lane &&
  a.namespace === b.namespace &&
  a.epoch === b.epoch &&
  a.expires_at === b.expires_at;

export const billingScopeActive = (scope, now = Date.now()) =>
  !!scope?.active && (scope.lane === 'production' || Date.parse(scope.expires_at) > now);

// This registry selects device-local storage only. Server RLS and a fresh RPC
// independently authorize every cloud operation; cached metadata grants no Pro.
export function createBillingScopeRegistry(base) {
  if (registries.has(base)) return registries.get(base);
  const queues = new Map();
  const closed = new Set();
  const serial = (id, work) => {
    const next = (queues.get(id) || Promise.resolve()).then(work);
    queues.set(
      id,
      next.catch(() => {}),
    );
    return next;
  };
  const ensureOpen = (id) => {
    if (closed.has(id)) throw unavailable();
  };
  const load = async (id) => {
    ensureOpen(id);
    const raw = await base.getItem(PREFIX + id);
    ensureOpen(id);
    return raw == null ? null : parseBillingScope(JSON.parse(raw), id);
  };
  const registry = {
    load: (id) => serial(id, () => load(id)),
    confirm: (value, isCurrent = () => true) =>
      serial(value?.user_id, async () => {
        const scope = parseBillingScope(value, value?.user_id);
        ensureOpen(scope.user_id);
        if (!isCurrent()) throw unavailable();
        const previous = await load(scope.user_id);
        if (previous && (!sameBillingScope(previous, scope) || (!previous.active && scope.active)))
          throw new Error('This account’s access changed. Sign out and contact support.');
        if (!isCurrent()) throw unavailable();
        await base.setItem(PREFIX + scope.user_id, JSON.stringify(scope));
        ensureOpen(scope.user_id);
        return scope;
      }),
    invalidate: (id) => closed.add(id),
    namespaces: (id) =>
      serial(id, async () => {
        // Cleanup may run after invalidate; inspect only this account's registry.
        const raw = await base.getItem(PREFIX + id);
        const scope = raw == null ? null : parseBillingScope(JSON.parse(raw), id);
        return [...new Set([scope?.namespace, `unresolved:${id}`].filter(Boolean))];
      }),
    forget: (id) => {
      closed.add(id);
      return serial(id, () => base.removeItem(PREFIX + id));
    },
  };
  registries.set(base, registry);
  return registry;
}

export const getCachedBillingScope = (base, id) => createBillingScopeRegistry(base).load(id);
export const getKnownBillingNamespaces = (base, id) =>
  createBillingScopeRegistry(base).namespaces(id);
export const invalidateBillingScope = (base, id) => createBillingScopeRegistry(base).invalidate(id);
export const forgetBillingScope = (base, id) => createBillingScopeRegistry(base).forget(id);

export async function accountRequest(work, timeoutMs = 12000) {
  const abort = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      abort.abort();
      reject(unavailable());
    }, timeoutMs);
  });
  try {
    return await Promise.race([work(abort.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function createAccountScopeResolver({ client, registry, timeoutMs = 12000 }) {
  return async (userId, { isCurrent = () => true } = {}) => {
    if (!client || !isCurrent()) throw unavailable();
    const { data, error } = await client.auth.getSession();
    const session = data?.session;
    if (error || session?.user.id !== userId || !isCurrent()) throw unavailable();
    const result = await accountRequest(
      (signal) =>
        client
          .rpc('get_account_billing_scope')
          .setHeader('Authorization', `Bearer ${session.access_token}`)
          .abortSignal(signal),
      timeoutMs,
    );
    if (result.error || !isCurrent()) throw unavailable();
    const scope = parseBillingScope(result.data, userId);
    return await registry.confirm(scope, isCurrent);
  };
}
