// Session actions own their continuation, not the native ad's lifetime. Cancel
// invalidates the action while an already-presented ad still drains normally.
export function createSessionAdActions({
  getState,
  stopAudioPreview,
  waitForAdsIdle,
  showAd,
  showStartAd,
  waitForForeground,
  startSession,
  finishSession,
  onBusy = () => {},
}) {
  let disposed = false;
  let version = 0;
  let pending = null;
  const read = () => {
    try {
      return getState();
    } catch {
      return null;
    }
  };
  const notify = (busy) => {
    if (disposed) return;
    try {
      onBusy(busy);
    } catch {}
  };
  const current = (operation) =>
    !disposed && pending === operation && operation.version === version;
  const sameOwner = (operation) => {
    const latest = read();
    return (
      current(operation) &&
      latest?.identity === operation.identity &&
      latest?.active === false &&
      latest?.sessionKey === operation.sessionKey &&
      (operation.kind === 'finish' || latest?.routine === operation.routine)
    );
  };
  const boundaryOwned = (operation, quiet = false) => {
    const latest = read();
    return (
      sameOwner(operation) &&
      latest?.focused === true &&
      latest?.blocked === false &&
      (!quiet || (latest?.musicPlaying === false && latest?.audioSyncing === false))
    );
  };
  const available = (operation, quiet = false) =>
    boundaryOwned(operation, quiet) && read()?.appActive === true;
  const begin = (kind, { opportunityId } = {}) => {
    // Coalesce all overlapping actions instead of queuing a second Start behind
    // the first action's full-screen presentation.
    if (pending) return pending.promise;
    const initial = read();
    const result = (performed, reason, shown = false) => ({ performed, reason, kind, shown });
    if (
      disposed ||
      !initial ||
      initial.active !== false ||
      (initial.identity !== null && (typeof initial.identity !== 'string' || !initial.identity)) ||
      (kind === 'start' &&
        (!initial.routine ||
          initial.focused !== true ||
          initial.appActive !== true ||
          initial.blocked !== false)) ||
      (kind === 'finish' && !initial.sessionKey)
    )
      return Promise.resolve(result(false, 'unavailable'));
    const operation = {
      kind,
      identity: initial.identity,
      routine: initial.routine,
      sessionKey: initial.sessionKey,
      version: ++version,
      promise: null,
    };
    pending = operation;
    operation.promise = Promise.resolve()
      .then(async () => {
        if (!sameOwner(operation)) return result(false, 'cancelled');
        let previewReady = true;
        try {
          await stopAudioPreview();
        } catch {
          previewReady = false;
        }
        if (!sameOwner(operation)) return result(false, 'cancelled');
        try {
          await waitForAdsIdle();
        } catch {
          return result(false, 'presentation-unsafe');
        }
        if (!sameOwner(operation)) return result(false, 'cancelled');
        if (kind === 'start' && !previewReady) return result(false, 'cleanup-error');
        let ad = { shown: false };
        if (previewReady && available(operation, true)) {
          try {
            const show = kind === 'start' && showStartAd ? showStartAd : showAd;
            ad = (await show({
              opportunityId,
              isEligible: () => available(operation, true),
              isCurrent: () => boundaryOwned(operation, true),
            })) || { shown: false };
          } catch {
            // A wrapper may throw after requesting native presentation. Never
            // assume that failure means its full-screen presenter has closed.
            ad = { shown: false };
          }
          try {
            await waitForAdsIdle();
          } catch {
            return result(false, 'presentation-unsafe', ad.shown === true);
          }
        }
        if (!sameOwner(operation)) return result(false, 'cancelled', ad.shown === true);
        if (kind === 'start') {
          if (ad.cancelled || (typeof ad.isCurrent === 'function' && !ad.isCurrent()))
            return result(false, 'cancelled', ad.shown === true);
          if (ad.shown === true && read()?.appActive === false) {
            try {
              await waitForForeground();
            } catch {}
          }
          if (!available(operation)) return result(false, 'cancelled', ad.shown === true);
          if (typeof ad.isCurrent === 'function' && !ad.isCurrent())
            return result(false, 'cancelled', ad.shown === true);
          if ((await startSession()) === false)
            return result(false, 'cancelled', ad.shown === true);
        } else {
          // Finish only dismisses this ended summary. It can honor that explicit
          // intent after blur/background, but cannot close another session's UI.
          await finishSession(operation.sessionKey);
        }
        return result(true, 'completed', ad.shown === true);
      })
      .catch(() => result(false, 'action-error'))
      .finally(() => {
        if (pending === operation) {
          pending = null;
          notify(false);
        }
      });
    notify(true);
    return operation.promise;
  };
  return {
    start: (options) => begin('start', options),
    finish: (options) => begin('finish', options),
    cancel() {
      version++;
    },
    dispose() {
      disposed = true;
      version++;
    },
  };
}
