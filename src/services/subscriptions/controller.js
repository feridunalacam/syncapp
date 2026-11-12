export const PRO_ENTITLEMENT = 'pro';

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
  onChange,
  now = Date.now,
  sdkEntitlementId = PRO_ENTITLEMENT,
}) {
  let epoch = 0;
  let userId = null;
  let sdkUserId = null;
  let initialized = false;
  let disposed = false;
  let verificationPending = 0;
  let backendVerified = false;
  let queue = Promise.resolve();
  let listener;
  let state = {
    ready: false,
    accessVerified: false,
    configured: !!sdk && !!apiKey,
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
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  };
  const requireIdentity = (version, id) => {
    if (!current(version, id) || !id) throw new Error('Sign in before changing a subscription.');
  };
  const identifySdk = async (id) => {
    if (!sdk || !apiKey) return;
    if (!initialized && id) {
      const configured = await sdk.isConfigured?.();
      if (configured) {
        // Fast Refresh / a remounted provider may reuse a configured native SDK.
        await sdk.logIn(id);
      } else {
        await sdk.configure({ apiKey, appUserID: id });
      }
      initialized = true;
      sdkUserId = id;
      listener = () => {
        // A listener event may belong to the previous identity. Fetch again in
        // the identity queue rather than trusting its unscoped payload.
        // This also retains a newly completed background purchase as pending
        // when canonical server verification is temporarily unavailable.
        if (userId) refresh({ sync: true }).catch(() => {});
      };
      if (!disposed) sdk.addCustomerInfoUpdateListener?.(listener);
    } else if (initialized && sdkUserId !== id) {
      if (id) await sdk.logIn(id);
      else if (sdkUserId) await sdk.logOut();
      sdkUserId = id;
    }
  };
  const read = async (version, id, { sync = false, customerInfo } = {}) => {
    try {
      if (!current(version, id)) return { stale: true };
      const info = customerInfo || state.customerInfo;
      const sdkActive = !!info?.entitlements?.active?.[sdkEntitlementId];
      // A completed store transaction must remain visible while the server is
      // unavailable. Retain its pending signal without granting cloud access.
      if (customerInfo) emit({ customerInfo: info, pending: !state.isPro && sdkActive });
      const result = await verify(id, { sync });
      if (!current(version, id)) return { stale: true };
      if (!result || !Object.hasOwn(result, 'entitlement'))
        throw new Error('Could not verify cloud access. Please try again.');
      const entitlement = result.entitlement || null;
      const isPro = isActiveEntitlement(entitlement, now());
      backendVerified = !result.syncError;
      emit({
        entitlement,
        isPro,
        customerInfo: info,
        pending: !isPro && sdkActive,
        error: result.syncError || null,
      });
      return { isPro, pending: !isPro && sdkActive };
    } catch (error) {
      if (current(version, id)) {
        backendVerified = false;
        emit({ error: message(error) });
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
      let customerInfo;
      let sdkError = null;
      try {
        if (sdk && apiKey) {
          await identifySdk(id);
          const [info, offerings] = await Promise.allSettled([
            sdk.getCustomerInfo(),
            sdk.getOfferings(),
          ]);
          if (info.status === 'fulfilled') customerInfo = info.value;
          if (offerings.status === 'fulfilled' && current(version, id))
            emit({ packages: offeredPackages(offerings.value.current) });
          if (info.status === 'rejected' || offerings.status === 'rejected')
            throw new Error('Store information unavailable');
        }
      } catch {
        sdkError =
          'Store subscription information is temporarily unavailable. Try Refresh access again later. Your timer and routines are still available.';
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
    const id = userId;
    emit({
      userId: id,
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
    if (id) return refresh();
    return enqueue(async () => {
      if (current(version, id)) await identifySdk(null);
    });
  };
  const transact = (kind, pkg) => {
    const version = epoch;
    const id = userId;
    requireIdentity(version, id);
    if (!sdk || !apiKey) throw new Error('Purchases are not available in this build yet.');
    if (state.loading) throw new Error('A subscription request is already in progress.');
    if (kind === 'purchase' && state.pending)
      throw new Error('Your purchase is awaiting verification. Refresh access in a moment.');
    emit({ loading: true, error: null });
    return enqueue(async () => {
      try {
        requireIdentity(version, id);
        await identifySdk(id);
        requireIdentity(version, id);
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
        if (current(version, id) && !result.isPro && !result.pending && kind === 'restore')
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
    getState: () => ({ ...state }),
    expire: () => {
      if (state.isPro && !isActiveEntitlement(state.entitlement, now())) emit({ isPro: false });
    },
    dispose: () => {
      disposed = true;
      epoch++;
      if (listener) sdk?.removeCustomerInfoUpdateListener?.(listener);
    },
  };
}
