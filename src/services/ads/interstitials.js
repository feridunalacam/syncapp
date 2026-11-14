// Preloading never presents an ad. Only an explicit natural-break action can
// consume an already-loaded creative; a late load cannot interrupt a workout.
export function createInterstitialController({
  getSdk,
  config,
  getCurrentGate,
  onChange = () => {},
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  loadTimeoutMs = 15000,
  maxAgeMs = 55 * 60 * 1000,
  cooldownMs = 120000,
  retryDelayMs = 30000,
}) {
  let gate = { identity: null, eligible: false, appActive: false, ready: false, blocked: false };
  let disposed = false;
  let version = 0;
  let cached = null;
  let presentation = null;
  let lastShownAt = -Infinity;
  let actionsSinceShown = 0;
  const actions = new Set();
  const attempts = new Set();
  const readinessWaiters = new Set();
  let retryAt = -Infinity;
  let state = { loaded: false, loading: false, presenting: false };
  const emit = (patch) => {
    state = { ...state, ...patch };
    if (!disposed) onChange(state);
    for (const notify of [...readinessWaiters]) notify();
  };
  const latest = () => getCurrentGate?.() || gate;
  const callerSafe = (check) => {
    try {
      return check() === true;
    } catch {
      return false;
    }
  };
  const allowed = (check, identity = gate.identity, requireReady = true) => {
    const current = latest();
    return (
      !disposed &&
      config.interstitialEnabled === true &&
      gate.eligible === true &&
      gate.appActive === true &&
      (!requireReady || gate.ready === true) &&
      !gate.blocked &&
      current.eligible === true &&
      current.appActive === true &&
      (!requireReady || current.ready === true) &&
      !current.blocked &&
      current.identity === identity &&
      gate.identity === identity &&
      callerSafe(check)
    );
  };
  const validOpportunity = (value) =>
    typeof value === 'string' && value.length > 0 && value.length <= 200;
  const remember = (collection, value) => {
    collection.add(value);
    if (collection.size > 128) collection.delete(collection.values().next().value);
  };
  const recordAction = ({ opportunityId, isEligible = () => true } = {}) => {
    if (
      presentation ||
      !validOpportunity(opportunityId) ||
      !allowed(isEligible, gate.identity, false) ||
      actions.has(opportunityId)
    )
      return false;
    remember(actions, opportunityId);
    actionsSinceShown++;
    return true;
  };
  const cleanup = (record) => {
    if (!record || record.cleaned) return;
    record.cleaned = true;
    if (record.timeout !== null) clearTimer(record.timeout);
    for (const unsubscribe of record.listeners) {
      try {
        unsubscribe?.();
      } catch {}
    }
    try {
      record.ad.destroy();
    } catch {}
  };
  const discard = (record = cached) => {
    if (!record || record === presentation) return;
    const wasCached = cached === record;
    if (wasCached) cached = null;
    cleanup(record);
    if (wasCached) emit({ loaded: false, loading: false });
  };
  const currentRecord = (record) =>
    cached === record && record.version === version && allowed(record.isEligible, record.identity);
  const finish = (record, reason) => {
    if (presentation !== record) return;
    presentation = null;
    if (reason === 'closed' && !record.opened) lastShownAt = now();
    if (reason === 'closed' && !record.opened) actionsSinceShown = 0;
    if (reason === 'error') retryAt = now() + retryDelayMs;
    cleanup(record);
    emit({ presenting: false, loaded: false, loading: false });
    record.resolve({ shown: record.opened || reason === 'closed', reason });
  };
  const presentReady = (isEligible, beforePresent, identity) => {
    if (presentation) return presentation.promise;
    if (!allowed(isEligible, identity)) {
      discard();
      return Promise.resolve({ shown: false, reason: 'ineligible' });
    }
    const record = cached;
    if (!record || record.loadedAt === null)
      return Promise.resolve({ shown: false, reason: 'not-ready' });
    if (!currentRecord(record)) {
      discard(record);
      return Promise.resolve({ shown: false, reason: 'ineligible' });
    }
    if (now() - record.loadedAt >= maxAgeMs) {
      discard(record);
      return Promise.resolve({ shown: false, reason: 'expired' });
    }
    cached = null;
    presentation = record;
    record.promise = new Promise((resolve) => {
      record.resolve = resolve;
    });
    emit({ loaded: false, loading: false, presenting: true });
    // React listeners may have changed the account or boundary during emit.
    if (!allowed(isEligible, record.identity)) {
      finish(record, 'ineligible');
      return record.promise;
    }
    const present = () => {
      if (presentation !== record) return;
      if (!allowed(isEligible, record.identity)) {
        finish(record, 'ineligible');
        return;
      }
      try {
        // show() resolves when the presentation request succeeds, not when
        // the ad closes. Only native CLOSED/ERROR releases this barrier.
        const showing = record.ad.show();
        showing?.catch?.(() => {
          if (presentation === record && !record.opened) finish(record, 'error');
        });
      } catch {
        finish(record, 'error');
      }
    };
    if (typeof beforePresent === 'function') {
      try {
        const accepted = beforePresent();
        if (accepted === true) present();
        else {
          accepted?.catch?.(() => {});
          finish(record, 'cancelled');
        }
      } catch {
        finish(record, 'cancelled');
      }
    } else present();
    return record.promise;
  };
  let api;
  let preparation = null;
  return (api = {
    getState: () => state,
    recordAction,
    waitUntilReady({ isEligible = () => true, timeoutMs = 1500 } = {}) {
      const identity = gate.identity;
      const ticket = version;
      const ready = () => cached?.loadedAt !== null && !!cached && currentRecord(cached);
      if (!allowed(isEligible, identity)) return Promise.resolve(false);
      if (ready()) return Promise.resolve(true);
      if (!state.loading) return Promise.resolve(false);
      return new Promise((resolve) => {
        let timer = null;
        let finished = false;
        const finishWaiting = (value) => {
          if (finished) return;
          finished = true;
          readinessWaiters.delete(check);
          if (timer !== null) clearTimer(timer);
          resolve(value);
        };
        const check = () => {
          if (version !== ticket || !allowed(isEligible, identity)) finishWaiting(false);
          else if (ready()) finishWaiting(true);
          else if (!state.loading) finishWaiting(false);
        };
        readinessWaiters.add(check);
        const loadingRecord = cached;
        timer = setTimer(
          () => {
            finishWaiting(false);
            if (cached === loadingRecord && loadingRecord?.loadedAt === null) {
              retryAt = now() + retryDelayMs;
              discard(loadingRecord);
            }
          },
          Math.min(1500, Math.max(0, timeoutMs)),
        );
        check();
      });
    },
    setGate(next) {
      if (
        ['identity', 'eligible', 'appActive', 'ready', 'blocked'].every(
          (key) => next[key] === gate[key],
        )
      )
        return;
      gate = next;
      version++;
      // destroy() does not dismiss a native full-screen ad. Keep its terminal
      // listeners after presentation, even if Pro/account/foreground changes.
      discard();
    },
    preload(isEligible = () => true) {
      if (presentation || !allowed(isEligible) || now() < retryAt) return false;
      if (cached) {
        if (!currentRecord(cached)) discard();
        else if (cached.loadedAt !== null && now() - cached.loadedAt >= maxAgeMs) discard();
        else return true;
      }
      let sdk;
      let ad;
      try {
        sdk = getSdk();
        const unitId = config.testMode ? sdk?.testInterstitialUnitId : config.interstitialUnitId;
        if (!sdk?.createInterstitial || !sdk.interstitialEvents || !unitId) return false;
        ad = sdk.createInterstitial(unitId, config.requestOptions);
      } catch {
        retryAt = now() + retryDelayMs;
        return false;
      }
      const record = {
        ad,
        version,
        identity: gate.identity,
        isEligible,
        loadedAt: null,
        opened: false,
        listeners: [],
        timeout: null,
        cleaned: false,
      };
      cached = record;
      const fail = () => {
        if (presentation === record) {
          retryAt = now() + retryDelayMs;
          finish(record, 'error');
        } else if (cached === record) {
          retryAt = now() + retryDelayMs;
          discard(record);
        }
      };
      try {
        const events = sdk.interstitialEvents;
        const listen = (type, callback) =>
          record.listeners.push(ad.addAdEventListener(type, callback));
        listen(events.loaded, () => {
          if (!currentRecord(record)) {
            discard(record);
            return;
          }
          if (record.timeout !== null) clearTimer(record.timeout);
          record.timeout = null;
          record.loadedAt = now();
          emit({ loaded: true, loading: false });
        });
        listen(events.opened, () => {
          if (presentation !== record) return;
          record.opened = true;
          lastShownAt = now();
          actionsSinceShown = 0;
        });
        listen(events.closed, () => finish(record, 'closed'));
        listen(events.error, fail);
        record.timeout = setTimer(() => {
          if (cached === record && record.loadedAt === null) fail();
        }, loadTimeoutMs);
        emit({ loaded: false, loading: true });
        if (!currentRecord(record)) {
          discard(record);
          return false;
        }
        const loading = ad.load();
        loading?.catch?.(fail);
        return true;
      } catch {
        fail();
        return false;
      }
    },
    showIfReady({
      opportunityId,
      isEligible = () => true,
      beforePresent,
      readinessTimeoutMs = 0,
    } = {}) {
      // Every concurrent caller waits for the same native presentation barrier.
      // Returning a quick "skipped" here could start a workout behind the ad.
      if (presentation) return presentation.promise;
      if (preparation) return preparation;
      recordAction({ opportunityId, isEligible });
      if (!allowed(isEligible)) {
        discard();
        return Promise.resolve({ shown: false, reason: 'ineligible' });
      }
      if (!validOpportunity(opportunityId))
        return Promise.resolve({ shown: false, reason: 'invalid-opportunity' });
      if (attempts.has(opportunityId))
        return Promise.resolve({ shown: false, reason: 'duplicate' });
      remember(attempts, opportunityId);
      if (now() - lastShownAt < cooldownMs)
        return Promise.resolve({ shown: false, reason: 'cooldown' });
      if (actionsSinceShown < 2) return Promise.resolve({ shown: false, reason: 'spacing' });
      if (readinessTimeoutMs > 0) {
        const identity = gate.identity;
        const deadline = now() + Math.min(1500, readinessTimeoutMs);
        if (!api.preload(isEligible)) return Promise.resolve({ shown: false, reason: 'not-ready' });
        const record = cached;
        const ticket = version;
        const pending = api
          .waitUntilReady({ isEligible, timeoutMs: Math.max(0, deadline - now()) })
          .then((loaded) =>
            loaded && record === cached && ticket === version && record.loadedAt <= deadline
              ? presentReady(isEligible, beforePresent, identity)
              : { shown: false, reason: 'not-ready' },
          );
        preparation = pending;
        pending
          .finally(() => {
            if (preparation === pending) preparation = null;
          })
          .catch(() => {});
        return pending;
      }
      return presentReady(isEligible, beforePresent, gate.identity);
    },
    invalidate() {
      version++;
      discard();
    },
    dispose() {
      disposed = true;
      version++;
      discard();
    },
  });
}
