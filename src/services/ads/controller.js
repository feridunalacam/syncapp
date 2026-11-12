const CONSENT_ERROR = 'Ad privacy choices could not be updated. Please try again later.';
const ADS_ERROR = 'Ads are unavailable right now.';
const PRIVACY_STATUSES = new Set(['UNKNOWN', 'REQUIRED', 'NOT_REQUIRED']);

// Consent belongs to the device; eligibility and every in-flight continuation
// belong to the current account, foreground state and visible placement.
export function createAdsController({ runtime, config, onChange = () => {}, getCurrentGate }) {
  let gate = { identity: null, eligible: false, appActive: false };
  let epoch = 0;
  let disposed = false;
  let operation = null;
  let privacyPromise = null;
  let preparationHolds = 0;
  let attemptedEpoch = -1;
  let consentInfo = null;
  let consentUpdated = false;
  const placements = new Set();
  let state = {
    ready: false,
    initialized: runtime.isInitialized(),
    consentReady: false,
    canRequestAds: false,
    nativeAvailable: runtime.hasNativeSupport(),
    privacyOptionsRequirementStatus: 'UNKNOWN',
    privacyOptionsRequired: false,
    privacyOptionsBusy: false,
    BannerComponent: null,
    bannerSize: null,
    bannerUnitId: null,
    testMode: config.testMode,
    requestOptions: config.requestOptions,
    error: null,
  };
  const emit = (patch) => {
    if (disposed) return;
    state = { ...state, ...patch };
    onChange(state);
  };
  const latestGate = () => getCurrentGate?.() || gate;
  const allowed = () => {
    const latest = latestGate();
    return (
      !disposed &&
      config.enabled &&
      [...placements].some((lease) => {
        try {
          return lease.isEligible() === true;
        } catch {
          return false;
        }
      }) &&
      gate.eligible &&
      gate.appActive &&
      !gate.blocked &&
      latest.eligible &&
      latest.appActive &&
      !latest.blocked &&
      latest.identity === gate.identity
    );
  };
  const current = (version) => version === epoch && allowed();
  const invalidate = () => {
    epoch += 1;
    emit({ ready: false, canRequestAds: false, consentReady: false });
  };
  const loadSdk = () => {
    const sdk = runtime.getSdk();
    if (!sdk) {
      emit({ nativeAvailable: false, error: 'Ads require an updated native build.' });
      return null;
    }
    emit({
      nativeAvailable: true,
      BannerComponent: sdk.BannerComponent,
      bannerSize: sdk.bannerSize,
      bannerUnitId: config.testMode ? sdk.testBannerUnitId : config.bannerUnitId,
    });
    return sdk;
  };
  const rememberConsent = (info) => {
    consentInfo = info;
    const status = PRIVACY_STATUSES.has(info?.privacyOptionsRequirementStatus)
      ? info.privacyOptionsRequirementStatus
      : 'UNKNOWN';
    emit({
      privacyOptionsRequirementStatus: status,
      privacyOptionsRequired: status === 'REQUIRED',
    });
  };
  const pump = () => {
    if (preparationHolds || operation || privacyPromise || !allowed() || attemptedEpoch === epoch)
      return;
    const version = epoch;
    attemptedEpoch = version;
    operation = (async () => {
      const sdk = loadSdk();
      if (!sdk || !current(version)) return;
      emit({ error: null });
      try {
        if (!consentUpdated) {
          const info = await sdk.consent.requestInfoUpdate();
          if (!current(version)) return;
          rememberConsent(info);
          // Split the UMP convenience helper so leaving Discover/backgrounding
          // cannot open a consent form after an old info request returns.
          const result = await sdk.consent.loadAndShowConsentFormIfRequired();
          if (!current(version)) return;
          const updated = result || (await sdk.consent.getConsentInfo());
          if (!current(version)) return;
          rememberConsent(updated);
          consentUpdated = true;
        }
        if (!consentInfo?.canRequestAds || !current(version)) return;
        emit({ consentReady: true });
        await runtime.configure(config.requestConfiguration);
        if (!current(version)) return;
        await runtime.initialize();
        if (!current(version)) return;
        emit({ initialized: true, ready: true, canRequestAds: true, error: null });
      } catch {
        if (current(version))
          emit({ ready: false, consentReady: false, canRequestAds: false, error: ADS_ERROR });
      }
    })().finally(() => {
      operation = null;
      // A new identity/foreground may have arrived while a native request was
      // pending. It gets its own checked continuation after the old one drains.
      if (!disposed && epoch !== version) pump();
    });
  };
  return {
    getState: () => state,
    holdPreparation() {
      if (disposed) return () => {};
      preparationHolds += 1;
      // Preserve already-ready consent/SDK state for a cached interstitial.
      // An unfinished preparation must not open a new native form after Start.
      if (!state.ready) invalidate();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        preparationHolds -= 1;
        if (!preparationHolds) pump();
      };
    },
    waitUntilIdle() {
      // Snapshot only work already in flight. Invalidating a placement stops
      // its continuation, but cannot dismiss native UMP UI already presented.
      // Do not pump, await a later request or release a still-visible form on a
      // timer; failures simply settle this barrier for the free core.
      const pending = [operation, privacyPromise].filter(Boolean);
      return Promise.allSettled(pending).then(() => undefined);
    },
    setGate(next) {
      if (
        next.identity === gate.identity &&
        next.eligible === gate.eligible &&
        next.appActive === gate.appActive &&
        next.blocked === gate.blocked
      )
        return;
      gate = next;
      invalidate();
      pump();
    },
    acquirePlacement(isEligible = () => true) {
      if (disposed) return () => {};
      const lease = { isEligible };
      placements.add(lease);
      invalidate();
      pump();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        placements.delete(lease);
        invalidate();
        pump();
      };
    },
    requestPrivacyOptions(isEligible = () => true) {
      if (privacyPromise) return privacyPromise;
      if (preparationHolds) return Promise.resolve(false);
      const callerSafe = () => {
        try {
          return isEligible() === true;
        } catch {
          return false;
        }
      };
      if (
        disposed ||
        !runtime.hasNativeSupport() ||
        !latestGate().appActive ||
        latestGate().blocked ||
        !callerSafe()
      )
        return Promise.resolve(false);
      const identity = latestGate().identity;
      // Stop old banner continuations immediately, including while this manual
      // action waits for a previous native consent request to finish.
      consentUpdated = false;
      consentInfo = null;
      invalidate();
      const version = epoch;
      const privacyCurrent = () =>
        !disposed &&
        epoch === version &&
        latestGate().identity === identity &&
        latestGate().appActive &&
        !latestGate().blocked &&
        callerSafe();
      privacyPromise = (async () => {
        if (operation) {
          await operation;
        }
        if (!privacyCurrent()) return false;
        const sdk = loadSdk();
        if (!sdk) return false;
        if (!privacyCurrent()) return false;
        emit({ privacyOptionsBusy: true, error: null });
        let failed = false;
        const task = (async () => {
          try {
            const info = await sdk.consent.requestInfoUpdate();
            if (!privacyCurrent()) return false;
            rememberConsent(info);
            if (info?.privacyOptionsRequirementStatus !== 'REQUIRED') return false;
            const result = await sdk.consent.showPrivacyOptionsForm();
            if (!privacyCurrent()) return false;
            const updated = result || (await sdk.consent.getConsentInfo());
            if (!privacyCurrent()) return false;
            rememberConsent(updated);
            consentUpdated = true;
            return true;
          } catch {
            if (privacyCurrent()) emit({ error: CONSENT_ERROR });
            failed = true;
            consentUpdated = false;
            consentInfo = null;
            return false;
          } finally {
            emit({ privacyOptionsBusy: false });
          }
        })();
        operation = task;
        try {
          return await task;
        } finally {
          if (operation === task) operation = null;
          // Privacy changes must be checked before the next banner request.
          epoch += 1;
          if (failed) attemptedEpoch = epoch;
        }
      })().finally(() => {
        privacyPromise = null;
        pump();
      });
      return privacyPromise;
    },
    dispose() {
      disposed = true;
      epoch += 1;
      placements.clear();
    },
  };
}
