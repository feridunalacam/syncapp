import {
  billingScopeActive,
  parseBillingScope,
  sameBillingScope,
} from '../../lib/accountBillingScope.js';

export const PRO_ENTITLEMENT = 'pro';
const SESSION = Symbol.for('syncapp.purchases.native-sessions');
const sessions = globalThis[SESSION] || (globalThis[SESSION] = new WeakMap());
const RESTART =
  'Close Sync completely and reopen it to finish switching accounts before using purchases.';
const restartError = () =>
  Object.assign(new Error(RESTART), { code: 'PURCHASES_RESTART_REQUIRED' });

export function isActiveEntitlement(entitlement, now = Date.now()) {
  return (
    entitlement?.entitlement_id === PRO_ENTITLEMENT &&
    Number.isFinite(Date.parse(entitlement.expires_at)) &&
    Date.parse(entitlement.expires_at) > now
  );
}

const message = (error) => error?.message || 'Subscriptions could not be loaded. Please try again.';
const isCancelled = (error) => error?.userCancelled === true;
const offeredPackages = (offering) =>
  (offering?.availablePackages || []).filter(
    (item) =>
      ['$rc_monthly', '$rc_annual'].includes(item.identifier) &&
      item.product?.priceString &&
      item.product?.identifier,
  );

// Every SDK call shares one queue. Changing accounts invalidates results immediately,
// but SDK identity cannot change while a purchase is still running for the old user.
export function createSubscriptionController({
  sdk,
  apiKey,
  verify,
  resolveScope,
  loadScope = async () => null,
  apiKeyForScope = (scope) => (scope.lane === 'production' ? apiKey : null),
  onChange,
  now = Date.now,
  sdkEntitlementId = PRO_ENTITLEMENT,
}) {
  let epoch = 0;
  let userId = null;
  const native = sdk
    ? sessions.get(sdk) || { queue: Promise.resolve(), key: null, initialized: false, userId: null }
    : null;
  if (sdk && !sessions.has(sdk)) sessions.set(sdk, native);
  let disposed = false;
  let verificationPending = 0;
  let backendVerified = false;
  let purchaseIneligible = false;
  let reviewAccessObserved = false;
  let lastReviewRenewal = -Infinity;
  let queue = Promise.resolve();
  let listener;
  let state = {
    ready: false,
    accessVerified: false,
    configured: false,
    scope: null,
    scopeConfirmed: false,
    requiresRestart: false,
    userId: null,
    packages: [],
    entitlement: null,
    isPro: false,
    customerInfo: null,
    pending: false,
    loading: false,
    error: null,
  };
  const emit = (update) => {
    if (disposed) return;
    state = { ...state, ...update };
    onChange?.(state);
  };
  const current = (version, id) => !disposed && epoch === version && userId === id;
  const beginVerification = (version, id) => {
    if (!current(version, id)) return;
    verificationPending++;
    emit({ accessVerified: false });
  };
  const enqueue = (operation) => {
    const result = (native ? native.queue : queue).then(operation);
    if (native) native.queue = result.catch(() => {});
    else queue = result.catch(() => {});
    return result;
  };
  const requireIdentity = (version, id) => {
    if (!current(version, id) || !id) throw new Error('Sign in before changing a subscription.');
  };
  const freshScope = async (version, id) => {
    if (!resolveScope) throw new Error('Account access could not be checked. Please retry.');
    const value = await resolveScope(id, { isCurrent: () => current(version, id) });
    if (!current(version, id)) return null;
    const scope = parseBillingScope(value, id);
    if (state.scope && !sameBillingScope(state.scope, scope))
      throw new Error('This account’s access changed. Sign out and contact support.');
    const active = billingScopeActive(scope, now());
    emit({
      scope,
      scopeConfirmed: true,
      configured: active && !!sdk && !!apiKeyForScope(scope),
      ...(active
        ? {}
        : {
            entitlement: null,
            isPro: false,
            packages: [],
            pending: false,
            accessVerified: false,
            error: 'Account purchase access is unavailable. Your local records remain available.',
          }),
    });
    return scope;
  };
  const identifySdk = async (id, scope, version) => {
    if (!sdk) return;
    if (!id) {
      if (native.initialized && native.userId && !native.uncertain) {
        try {
          await sdk.logOut();
        } catch {
          native.uncertain = true;
          throw restartError();
        }
        native.userId = null;
      }
      return;
    }
    if (state.requiresRestart) throw restartError();
    if (!billingScopeActive(scope, now()))
      throw new Error('Account purchase access is unavailable.');
    const selectedKey = apiKeyForScope(scope);
    if (!selectedKey) return;
    if (native.uncertain || (native.initialized && native.key !== selectedKey))
      throw restartError();
    if (!native.initialized) {
      const configured = await sdk.isConfigured?.();
      if (!current(version, id)) return;
      if (!billingScopeActive(scope, now()))
        throw new Error('Account purchase access is unavailable.');
      // A JS reload cannot establish which project an existing native singleton
      // belongs to. Never infer its key from the current account or cached scope.
      if (configured) {
        native.uncertain = true;
        throw restartError();
      }
      try {
        await sdk.configure({ apiKey: selectedKey, appUserID: id });
      } catch {
        native.uncertain = true;
        throw restartError();
      }
      native.initialized = true;
      native.key = selectedKey;
      native.userId = id;
    } else if (native.userId !== id) {
      try {
        await sdk.logIn(id);
      } catch {
        native.uncertain = true;
        throw restartError();
      }
      native.userId = id;
    }
    if (!listener) {
      listener = () => {
        // A listener event may belong to the previous identity. Fetch again in
        // the identity queue rather than trusting its unscoped payload.
        // This also retains a newly completed background purchase as pending
        // when canonical server verification is temporarily unavailable.
        if (userId) refresh({ sync: true }).catch(() => {});
      };
      if (!disposed) sdk.addCustomerInfoUpdateListener?.(listener);
    }
  };
  const read = async (version, id, { sync = false, customerInfo } = {}) => {
    try {
      if (!current(version, id)) return { stale: true };
      const info = customerInfo || state.customerInfo;
      const sdkActive = !!info?.entitlements?.active?.[sdkEntitlementId];
      // A completed store transaction must remain visible while the server is
      // unavailable. Retain its pending signal without granting cloud access.
      const scope = state.scope;
      if (!state.scopeConfirmed || !billingScopeActive(scope, now()))
        throw new Error('Account access could not be checked. Please retry.');
      if (customerInfo)
        emit({ customerInfo: info, pending: !state.isPro && sdkActive && !purchaseIneligible });
      const result = await verify(id, { sync, scope });
      if (!current(version, id)) return { stale: true };
      if (!result || !Object.hasOwn(result, 'entitlement'))
        throw new Error('Could not verify cloud access. Please try again.');
      const entitlement = result.entitlement || null;
      if (result.scope && !sameBillingScope(scope, parseBillingScope(result.scope, id)))
        throw new Error('Your account changed. Please retry.');
      const scopeActive = billingScopeActive(scope, now());
      if (scope.lane === 'review' && result.verificationError !== undefined)
        purchaseIneligible = result.verificationError === 'review_purchase_not_eligible';
      const isPro =
        scopeActive &&
        !purchaseIneligible &&
        isActiveEntitlement(entitlement, now()) &&
        (scope.lane !== 'review' ||
          (entitlement?.namespace === scope.namespace &&
            entitlement?.epoch === scope.epoch &&
            entitlement?.environment === 'SANDBOX' &&
            entitlement?.store === 'app_store'));
      if (scope.lane === 'review') {
        if (isPro) reviewAccessObserved = true;
        else if (sync && !result.syncError) reviewAccessObserved = false;
      }
      backendVerified = scopeActive && !result.syncError;
      emit({
        entitlement,
        isPro,
        customerInfo: info,
        pending: scopeActive && !isPro && sdkActive && !purchaseIneligible,
        error: !scopeActive
          ? 'Account purchase access is unavailable.'
          : purchaseIneligible
            ? 'This review account cannot verify a production purchase. Use the assigned Apple sandbox test purchase or contact support.'
            : result.syncError || null,
        ...(scopeActive ? {} : { configured: false, packages: [] }),
      });
      return {
        isPro,
        pending: scopeActive && !isPro && sdkActive && !purchaseIneligible,
        ...(purchaseIneligible ? { ineligible: true } : {}),
      };
    } catch (error) {
      if (current(version, id)) {
        backendVerified = false;
        emit({ isPro: false, entitlement: null, error: message(error) });
      }
      throw error;
    } finally {
      if (current(version, id)) {
        verificationPending--;
        emit({ accessVerified: verificationPending === 0 && backendVerified });
      }
    }
  };
  const refresh = ({ sync = false } = {}) => {
    const version = epoch;
    const id = userId;
    if (!id || disposed) return Promise.resolve();
    beginVerification(version, id);
    return enqueue(async () => {
      if (!current(version, id)) return { stale: true };
      let scope;
      try {
        scope = await freshScope(version, id);
      } catch (error) {
        if (current(version, id)) {
          verificationPending--;
          backendVerified = false;
          emit({
            ready: true,
            configured: false,
            scopeConfirmed: false,
            accessVerified: false,
            isPro: false,
            packages: [],
            error: message(error),
          });
        }
        throw error;
      }
      if (!current(version, id)) return { stale: true };
      if (!billingScopeActive(scope, now())) {
        emit({ ready: true });
        verificationPending--;
        return { inactive: true };
      }
      let customerInfo;
      let sdkError = null;
      try {
        if (sdk && apiKeyForScope(scope)) {
          await identifySdk(id, scope, version);
          if (!current(version, id)) return { stale: true };
          if (!billingScopeActive(scope, now()))
            throw new Error('Account purchase access is unavailable.');
          const [info, offerings] = await Promise.allSettled([
            sdk.getCustomerInfo(),
            sdk.getOfferings(),
          ]);
          if (info.status === 'fulfilled') customerInfo = info.value;
          if (
            offerings.status === 'fulfilled' &&
            current(version, id) &&
            billingScopeActive(scope, now())
          )
            emit({ packages: offeredPackages(offerings.value.current) });
          if (info.status === 'rejected' || offerings.status === 'rejected')
            throw new Error('Store information unavailable');
        }
      } catch (error) {
        if (error.code === 'PURCHASES_RESTART_REQUIRED' && current(version, id))
          emit({ requiresRestart: true, configured: false, packages: [] });
        sdkError =
          error.code === 'PURCHASES_RESTART_REQUIRED'
            ? RESTART
            : 'Store subscription information is temporarily unavailable. Try Refresh access again later. Your timer and routines are still available.';
      }
      try {
        const result = await read(version, id, { sync, customerInfo });
        if (current(version, id) && sdkError) emit({ error: sdkError });
        return result;
      } catch (error) {
        if (current(version, id)) emit({ error: message(error) });
        throw error;
      } finally {
        if (current(version, id)) emit({ ready: true });
      }
    });
  };
  const identify = (nextUserId) => {
    const version = ++epoch;
    userId = nextUserId || null;
    verificationPending = 0;
    backendVerified = false;
    purchaseIneligible = false;
    reviewAccessObserved = false;
    lastReviewRenewal = -Infinity;
    const id = userId;
    emit({
      userId: id,
      scope: null,
      scopeConfirmed: false,
      configured: false,
      requiresRestart: false,
      ready: !id,
      accessVerified: false,
      loading: false,
      error: null,
      pending: false,
      packages: [],
      entitlement: null,
      isPro: false,
      customerInfo: null,
    });
    if (id)
      return Promise.resolve(loadScope(id))
        .then((cached) => {
          if (current(version, id) && cached) emit({ scope: parseBillingScope(cached, id) });
        })
        .catch(() => {})
        .then(() => (current(version, id) ? refresh() : { stale: true }));
    return enqueue(async () => {
      if (current(version, id)) await identifySdk(null);
    });
  };
  const transact = (kind, pkg) => {
    const version = epoch;
    const id = userId;
    requireIdentity(version, id);
    if (state.requiresRestart) throw restartError();
    if (
      !sdk ||
      !state.scopeConfirmed ||
      !billingScopeActive(state.scope, now()) ||
      !apiKeyForScope(state.scope)
    )
      throw new Error('Purchases are not available in this build yet.');
    if (state.loading) throw new Error('A subscription request is already in progress.');
    if (kind === 'purchase' && state.pending)
      throw new Error('Your purchase is awaiting verification. Refresh access in a moment.');
    emit({ loading: true, error: null });
    return enqueue(async () => {
      try {
        requireIdentity(version, id);
        const scope = await freshScope(version, id);
        requireIdentity(version, id);
        if (!billingScopeActive(scope, now()))
          throw new Error('Account purchase access is unavailable.');
        await identifySdk(id, scope, version);
        requireIdentity(version, id);
        if (!billingScopeActive(scope, now()))
          throw new Error('Account purchase access is unavailable.');
        const available = state.packages.find(
          (item) =>
            item.identifier === pkg?.identifier &&
            item.product.identifier === pkg?.product?.identifier,
        );
        if (kind === 'purchase' && !available)
          throw new Error('This plan is no longer available. Refresh plans and try again.');
        const response =
          kind === 'purchase' ? await sdk.purchasePackage(available) : await sdk.restorePurchases();
        if (!current(version, id)) return { stale: true };
        const customerInfo = kind === 'purchase' ? response.customerInfo : response;
        beginVerification(version, id);
        const result = await read(version, id, { sync: true, customerInfo });
        if (
          current(version, id) &&
          !result.isPro &&
          !result.pending &&
          !result.ineligible &&
          kind === 'restore'
        )
          emit({ error: 'No active Pro subscription was found for this account.' });
        return result;
      } catch (error) {
        if (isCancelled(error)) return { cancelled: true };
        if (current(version, id)) emit({ error: message(error) });
        throw error;
      } finally {
        if (current(version, id)) emit({ loading: false, ready: true });
      }
    });
  };
  return {
    identify,
    refresh,
    purchase: (pkg) => transact('purchase', pkg),
    restore: () => transact('restore'),
    renewReviewAccess: ({ foreground = false } = {}) => {
      const time = now();
      // Review access is deliberately leased for five minutes. Renew only a
      // previously verified review purchase; never poll production or Free users.
      if (
        !foreground ||
        disposed ||
        !userId ||
        !reviewAccessObserved ||
        state.scope?.lane !== 'review' ||
        !billingScopeActive(state.scope, time) ||
        state.loading ||
        verificationPending ||
        time - lastReviewRenewal < 30000 ||
        Date.parse(state.entitlement?.expires_at) - time > 60000
      )
        return Promise.resolve();
      lastReviewRenewal = time;
      return refresh({ sync: true });
    },
    getState: () => ({ ...state }),
    expire: () => {
      if (state.scope && !billingScopeActive(state.scope, now()))
        emit({
          isPro: false,
          accessVerified: false,
          configured: false,
          packages: [],
          pending: false,
        });
      else if (state.isPro && !isActiveEntitlement(state.entitlement, now()))
        emit({ isPro: false });
    },
    dispose: () => {
      disposed = true;
      epoch++;
      if (listener) sdk?.removeCustomerInfoUpdateListener?.(listener);
    },
  };
}
