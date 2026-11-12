// The native application player is shared across account-scoped controllers.
// A retired controller must never stop a newer controller's queue.
const owners = new WeakMap();
const requests = new WeakMap();
const listeners = new WeakMap();
let controllerSequence = 0;
const notifyOwners = (service) => listeners.get(service)?.forEach((listener) => listener());
const cancelled = () => ({ success: true, cancelled: true });
const failureMessage = (error) =>
  error?.userMessage || error?.message || 'Apple Music could not complete this request.';
const check = (result) => {
  if (result === false || result?.success === false)
    throw new Error(result?.error || 'Apple Music could not complete this request.');
  return result;
};
const metadata = (item) =>
  item
    ? {
        ...item,
        title: item.title || item.name || 'Apple Music',
        artist: item.artists?.[0]?.name || item.artist || '',
        album: typeof item.album === 'string' ? item.album : item.album?.name || '',
        duration: item.duration ?? (item.duration_ms ?? item.durationMs ?? 0) / 1000,
        coverUrl: item.coverUrl || item.image || item.album?.images?.[0]?.url || null,
      }
    : null;

/** User-initiated playback only. No routine, account, entitlement or timer calls. */
export function createAppleMusicCompanionController({
  service,
  onChange = () => {},
  acquireBlocker = () => () => {},
  waitForPresenters = async () => {},
  beforePlay = async () => {},
  pollIntervalMs = 1000,
} = {}) {
  let state = {
    visible: false,
    busy: false,
    reserved: false,
    ownsQueue: false,
    playing: false,
    track: null,
    progress: 0,
    error: null,
    shuffle: false,
    repeat: 'off',
    previousOwnerPending: false,
  };
  const controllerId = ++controllerSequence;
  let disposed = false;
  let appActive = true;
  let generation = 0;
  let starts = 0;
  let permissions = 0;
  let actions = 0;
  let entry = null;
  let releaseBlocker = null;
  let timer = null;
  let read = null;
  let stopping = Promise.resolve();
  const controlVersions = new Map();
  const owns = () => !!entry && owners.get(service) === entry;
  const retiredOwner = () => {
    const previous = owners.get(service);
    return previous && previous.controllerId < controllerId && previous.retired() ? previous : null;
  };
  const snapshot = () => ({ ...state, previousOwnerPending: !!retiredOwner() });
  const publish = (patch = {}) => {
    state = {
      ...state,
      ...patch,
      busy: starts + permissions + actions > 0,
      reserved: starts > 0,
      ownsQueue: owns(),
      previousOwnerPending: !!retiredOwner(),
    };
    const held =
      state.visible || state.busy || state.ownsQueue || (!disposed && state.previousOwnerPending);
    if (held && !releaseBlocker) {
      const lease = acquireBlocker();
      releaseBlocker = typeof lease === 'function' ? lease : () => lease?.release?.();
    } else if (!held && releaseBlocker) {
      const release = releaseBlocker;
      releaseBlocker = null;
      release();
    }
    onChange(snapshot());
  };
  const clearTimer = () => {
    clearTimeout(timer);
    timer = null;
  };
  const schedule = () => {
    if (disposed || !appActive || !owns() || timer || read) return;
    timer = setTimeout(
      () => {
        timer = null;
        void refresh();
      },
      Math.max(1, pollIntervalMs),
    );
    timer.unref?.();
  };
  const refresh = () => {
    if (disposed || !appActive || !owns()) return Promise.resolve(cancelled());
    if (read) return read;
    clearTimer();
    const current = entry;
    const ticket = generation;
    read = Promise.resolve()
      .then(() => service.getCurrentPlayback())
      .then((playback) => {
        check(playback);
        if (disposed || !appActive || entry !== current || !owns() || generation !== ticket)
          return cancelled();
        const track = playback?.item ? metadata(playback.item) : state.track;
        const position = (playback?.progress_ms ?? playback?.progressMs ?? 0) / 1000;
        const percent = track?.duration > 0 ? (position / track.duration) * 100 : 0;
        publish({
          playing: playback?.is_playing ?? playback?.isPlaying ?? false,
          track,
          progress: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0,
        });
        return playback;
      })
      .catch((error) => {
        if (!disposed && entry === current && owns() && generation === ticket)
          publish({ error: failureMessage(error) });
        return { success: false, error: failureMessage(error) };
      })
      .finally(() => {
        read = null;
        schedule();
      });
    return read;
  };
  const revoke = () => {
    generation++;
    entry = null;
    clearTimer();
    publish({ playing: false, track: null, progress: 0 });
  };
  const stopOwned = (current) => {
    if (!current || owners.get(service) !== current) return Promise.resolve(cancelled());
    if (current.stopping) return current.stopping;
    current.stopping = (async () => {
      check(await service.cleanup());
      if (owners.get(service) === current) owners.delete(service);
      if (entry === current) {
        entry = null;
        clearTimer();
        publish({ playing: false, track: null, progress: 0 });
      }
      notifyOwners(service);
      return { success: true };
    })();
    // A newer explicit choice waits for this stop acknowledgement before starting.
    stopping = current.stopping.catch(() => {});
    current.stopping
      .finally(() => {
        current.stopping = null;
      })
      .catch(() => {});
    return current.stopping;
  };
  const start = async (kind, selection, shuffle = false) => {
    if (disposed || (kind === 'resume' && !owns())) return cancelled();
    const ticket = ++generation;
    const request = {};
    requests.set(service, request);
    const stale = () => disposed || ticket !== generation || requests.get(service) !== request;
    starts++;
    publish({ error: null });
    let started = null;
    try {
      await waitForPresenters();
      if (stale()) return cancelled();
      check(await beforePlay());
      if (stale()) return cancelled();
      await stopping;
      if (stale()) return cancelled();
      const prior = owners.get(service);
      if (prior?.stopping) await prior.stopping;
      if (stale()) return cancelled();
      if (owners.get(service)?.retired())
        throw new Error('Clear the previous Apple Music queue before starting music.');
      const access = await service.getAccessToken();
      check(access);
      if (stale()) return cancelled();
      if (!access?.accessToken) throw new Error('Connect Apple Music to start playback.');
      // Recheck after each wait: an account may acquire a new queue while its
      // predecessor's stop or our subscription check is still outstanding.
      let previousOwner;
      while (true) {
        const previous = owners.get(service);
        if (previous?.stopping) {
          await previous.stopping;
          if (stale()) return cancelled();
          continue;
        }
        if (previous?.retired())
          throw new Error('Clear the previous Apple Music queue before starting music.');
        previousOwner = previous !== entry ? previous : null;
        break;
      }
      started = {
        revoke,
        stopping: null,
        controllerId,
        retired: () => disposed,
        stop: () => stopOwned(started),
      };
      entry = started;
      owners.set(service, started);
      if (previousOwner && previousOwner !== started) previousOwner.revoke();
      notifyOwners(service);
      publish({
        playing: false,
        ...(kind === 'resume' ? {} : { track: metadata(selection), progress: 0 }),
      });
      const options = { isCancelled: stale };
      const result = check(
        kind === 'track'
          ? await service.playTrack(
              access.accessToken,
              selection?.uri || `apple-music:song:${selection?.id}`,
              'appleMusic',
              options,
            )
          : kind === 'playlist'
            ? await service.playPlaylist(
                access.accessToken,
                selection?.id,
                'appleMusic',
                shuffle,
                options,
              )
            : await service.play(access.accessToken, 'appleMusic', options),
      );
      if (stale() || !owns() || entry !== started) return cancelled();
      if (result?.cancelled) {
        await stopOwned(started);
        return cancelled();
      }
      if (kind !== 'resume') {
        check(await service.setRepeat(access.accessToken, state.repeat));
        if (stale() || !owns() || entry !== started) return cancelled();
      }
      publish({ playing: true, ...(kind === 'playlist' ? { shuffle } : {}), error: null });
      void refresh();
      return result ?? { success: true };
    } catch (error) {
      if (stale()) return cancelled();
      publish({ error: failureMessage(error) });
      // A failed initial start may already have installed a native queue.
      // Resume failure keeps its paused queue owned for local controls/clear.
      if (kind !== 'resume' && started && entry === started && owns()) {
        try {
          await stopOwned(started);
        } catch {
          /* Retain ownership until stop is acknowledged. */
        }
      }
      return { success: false, error: failureMessage(error) };
    } finally {
      starts--;
      publish();
      schedule();
    }
  };
  const control = async (method, args = [], patch = {}, invalidatesStart = false) => {
    if (disposed) return cancelled();
    if (invalidatesStart) generation++;
    if (!owns()) return cancelled();
    const current = entry;
    const ticket = generation;
    const version = (controlVersions.get(method) || 0) + 1;
    controlVersions.set(method, version);
    const relevant = () =>
      !disposed &&
      entry === current &&
      owns() &&
      generation === ticket &&
      controlVersions.get(method) === version;
    actions++;
    publish({ error: null });
    try {
      const result = check(await service[method]('native:appleMusic', ...args));
      if (!relevant()) return cancelled();
      publish({ ...patch, error: null });
      if (method !== 'pause') void refresh();
      return result ?? { success: true };
    } catch (error) {
      if (!relevant()) return cancelled();
      publish({ error: failureMessage(error) });
      return { success: false, error: failureMessage(error) };
    } finally {
      actions--;
      publish();
    }
  };
  const clear = async (recoverPrevious = true) => {
    generation++;
    clearTimer();
    actions++;
    publish({ error: null });
    try {
      if (owns()) return await stopOwned(entry);
      const previous = recoverPrevious ? retiredOwner() : null;
      if (previous) {
        // The captured retired owner's stop checks identity again at dispatch.
        // A stale controller can never clear a live or newer account's queue.
        const result = check(await previous.stop());
        publish({ playing: false, track: null, progress: 0 });
        return result;
      }
      publish({ playing: false, track: null, progress: 0 });
      return { success: true };
    } catch (error) {
      publish({ error: failureMessage(error) });
      return { success: false, error: failureMessage(error) };
    } finally {
      actions--;
      publish();
    }
  };
  const ownerChanged = () => publish();
  const serviceListeners = listeners.get(service) || new Set();
  listeners.set(service, serviceListeners);
  serviceListeners.add(ownerChanged);
  return {
    getState: snapshot,
    isActive: () => starts > 0 || owns() || !!retiredOwner(),
    setVisible(visible) {
      if (disposed) return;
      publish({ visible: !!visible });
    },
    setAppActive(active) {
      if (disposed) return;
      appActive = !!active;
      if (!appActive) clearTimer();
      else void refresh(); // Observe only; returning to the app never starts playback.
    },
    async runPermission(operation = () => service.authorize()) {
      if (disposed) return cancelled();
      const ticket = generation;
      permissions++;
      publish({ error: null });
      try {
        await waitForPresenters();
        if (disposed || ticket !== generation) return cancelled();
        const result = check(await operation());
        return disposed || ticket !== generation ? cancelled() : result;
      } catch (error) {
        if (disposed || ticket !== generation) return cancelled();
        publish({ error: failureMessage(error) });
        return { success: false, error: failureMessage(error) };
      } finally {
        permissions--;
        publish();
      }
    },
    playTrack: (track) => start('track', track),
    playPlaylist: (playlist, shuffle = false) => start('playlist', playlist, !!shuffle),
    pause: () => control('pause', [], { playing: false }, true),
    resume: () => start('resume', state.track),
    next: () => control('next'),
    previous: () => control('previous'),
    setShuffle: (shuffle) => control('setShuffle', [!!shuffle], { shuffle: !!shuffle }),
    setRepeat(mode) {
      if (!['off', 'track', 'context'].includes(mode))
        return Promise.resolve({ success: false, error: 'Choose a valid repeat mode.' });
      return control('setRepeat', [mode], { repeat: mode });
    },
    clear: () => clear(),
    refresh,
    dispose() {
      if (disposed) return stopping;
      disposed = true;
      state = { ...state, visible: false };
      serviceListeners.delete(ownerChanged);
      notifyOwners(service);
      return clear(false);
    },
  };
}
