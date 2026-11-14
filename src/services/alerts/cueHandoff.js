const cancelled = () => ({ cancelled: true });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};

/** An exclusive cue lane. Sources retain their own native owner/user-intent fences. */
export function createCueHandoff({
  stopOutput,
  needsMusicHandoff = () => false,
  now = Date.now,
  schedule = setTimeout,
  cancel = clearTimeout,
}) {
  const sources = new Set();
  let epoch = 0;
  let current = null;
  let burst = null;

  const clearHold = (value) => {
    if (value.timer !== null) cancel(value.timer);
    value.timer = null;
    value.holdUntil = 0;
  };
  const settleCancelled = (request) => {
    if (!request) return;
    request.cancelled = true;
    request.done.resolve(cancelled());
    if (current === request) current = null;
  };
  const requestIsCurrent = (request) =>
    !request.cancelled && current === request && request.epoch === epoch;

  // Release is deliberately background work: a music queue may itself be awaiting
  // stop(). Waiting for pause/resume from stop() would deadlock that same queue.
  const releaseIfReady = (value) => {
    if (
      burst !== value ||
      value.releasing ||
      !value.pauseDone ||
      !value.drained ||
      value.stops.size ||
      current?.burst === value
    )
      return;
    if (!value.cancelled && value.holdUntil > now()) {
      if (value.timer === null) {
        value.timer = schedule(() => {
          value.timer = null;
          releaseIfReady(value);
        }, value.holdUntil - now());
        value.timer?.unref?.();
      }
      return;
    }
    clearHold(value);
    value.releasing = true;
    void (async () => {
      for (const { registration, ticket } of value.tickets) {
        try {
          if (value.allowResume && value.epoch === epoch && sources.has(registration))
            await ticket.resume();
        } catch {
          // No retries: the source owns playback error reporting and intent checks.
        } finally {
          try {
            await ticket.release?.();
          } catch {
            /* Continue releasing other tickets. */
          }
        }
      }
    })()
      .finally(() => {
        if (burst === value) burst = null;
        value.done.resolve();
      })
      .catch(() => {});
  };

  const trackStop = (pending, value) => {
    if (!value.stops.size) value.stopFailed = false;
    value.drained = false;
    value.stops.add(pending);
    pending.then(
      () => {
        value.stops.delete(pending);
        if (!value.stops.size && !value.stopFailed) value.drained = true;
        releaseIfReady(value);
      },
      () => {
        value.stops.delete(pending);
        value.stopFailed = true;
        value.allowResume = false;
        value.drained = false;
      },
    );
  };
  const stopNative = (owner, value) => {
    // Invoke synchronously so cancellation reaches native output immediately.
    let pending;
    try {
      pending = Promise.resolve(stopOutput(owner));
    } catch (error) {
      pending = Promise.reject(error);
    }
    if (value) trackStop(pending, value);
    else pending.catch(() => {});
    return pending;
  };
  const waitForDrain = async (value) => {
    while (value.stops.size) await Promise.all([...value.stops]);
    if (!value.drained || value.stopFailed)
      throw new Error('Cue output silence is not acknowledged.');
  };

  const makeBurst = () => {
    const value = {
      epoch,
      owner: null,
      cancelled: false,
      allowResume: true,
      tickets: [],
      pauseDone: false,
      drained: false,
      stops: new Set(),
      stopFailed: false,
      timer: null,
      holdUntil: 0,
      releasing: false,
      done: deferred(),
      pause: null,
    };
    burst = value;
    const registrations = [...sources];
    value.pause = Promise.allSettled(
      registrations.map(async (registration) => {
        const ticket = await registration.source.suspendForCue({
          isCancelled: () => value.cancelled || value.epoch !== epoch || !sources.has(registration),
        });
        if (ticket == null) return;
        if (typeof ticket.resume !== 'function')
          throw new Error('Music did not acknowledge cue suspension.');
        value.tickets.push({ registration, ticket });
      }),
    )
      .then((results) => {
        const failed = results.find((result) => result.status === 'rejected');
        if (failed) {
          value.allowResume = false;
          throw failed.reason;
        }
      })
      .finally(() => {
        value.pauseDone = true;
        releaseIfReady(value);
      });
    value.pause.catch(() => {});
    return value;
  };

  const getBurst = async (request) => {
    while (burst?.releasing || burst?.cancelled || (burst && burst.epoch !== epoch)) {
      await burst.done.promise;
      if (!requestIsCurrent(request)) return null;
    }
    if (!requestIsCurrent(request)) return null;
    const value = burst || makeBurst();
    request.burst = value;
    value.owner = request.owner;
    clearHold(value);
    if (request.event.resumeMusic === false) value.allowResume = false;
    return value;
  };

  const retireEpoch = () => {
    epoch++;
    const old = current;
    settleCancelled(old);
    if (burst && !burst.releasing) {
      burst.cancelled = true;
      burst.allowResume = false;
      clearHold(burst);
      stopNative(old?.owner ?? burst.owner, burst).catch(() => {});
      releaseIfReady(burst);
    }
  };

  return {
    register(source) {
      if (!source || typeof source.suspendForCue !== 'function')
        throw new TypeError('A cue source must support suspendForCue.');
      retireEpoch();
      const registration = { source };
      sources.add(registration);
      let removed = false;
      return () => {
        if (removed) return;
        removed = true;
        sources.delete(registration);
        retireEpoch();
      };
    },
    hasSources: () => sources.size > 0,
    run(owner, event = {}, playOutput) {
      const old = current;
      settleCancelled(old);
      // A phase change can stop an old cue and request the next one in the same
      // turn. Keep its acknowledged music intent while that burst has not begun
      // releasing; the new cue still waits for every native stop acknowledgement.
      if (
        burst?.cancelled &&
        burst.epoch === epoch &&
        !burst.releasing &&
        (!burst.pauseDone || burst.tickets.length)
      )
        burst.cancelled = false;
      const request = { owner, event, epoch, cancelled: false, burst: null, done: deferred() };
      current = request;
      // Superseding a pending cue never waits for its music suspension to finish.
      const stoppedBurst = burst?.releasing ? null : burst;
      const initialStop = stopNative(old?.owner ?? owner, stoppedBurst);
      initialStop.catch(() => {});
      void (async () => {
        const value = await getBurst(request);
        if (!value) return;
        if (value !== stoppedBurst) trackStop(initialStop, value);
        try {
          await Promise.all([initialStop, value.pause]);
          await waitForDrain(value);
          if (!requestIsCurrent(request)) return;
          if (
            (event.expiresAt != null && now() > event.expiresAt) ||
            (needsMusicHandoff() && !value.tickets.length)
          ) {
            request.done.resolve(cancelled());
            return;
          }
          value.drained = false;
          const result = await playOutput(() => !requestIsCurrent(request));
          if (!requestIsCurrent(request)) return;
          await stopNative(owner, value);
          await waitForDrain(value);
          if (!requestIsCurrent(request)) return;
          if (event.kind === 'count') {
            const deadline = Number.isFinite(event.expiresAt) ? event.expiresAt : now();
            value.holdUntil = deadline + 250;
          }
          request.done.resolve(result);
        } catch (error) {
          if (requestIsCurrent(request)) request.done.reject(error);
        } finally {
          const wasCurrent = current === request;
          if (wasCurrent) current = null;
          // Also drain when a source fails or a cue callback throws before finish.
          if (
            wasCurrent &&
            burst === value &&
            !value.drained &&
            !value.stops.size &&
            !value.stopFailed
          )
            stopNative(owner, value).catch(() => {});
          releaseIfReady(value);
        }
      })().catch((error) => {
        if (requestIsCurrent(request)) {
          current = null;
          request.done.reject(error);
        }
      });
      return request.done.promise;
    },
    stop(owner) {
      const relevant = current?.owner === owner || (!current && burst?.owner === owner);
      if (relevant) {
        settleCancelled(current);
        if (burst && !burst.releasing) {
          burst.cancelled = true;
          clearHold(burst);
        }
      }
      const value = relevant && !burst?.releasing ? burst : null;
      const stopped = stopNative(owner, value);
      if (value) releaseIfReady(value);
      return stopped;
    },
  };
}
