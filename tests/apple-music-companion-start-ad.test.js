import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppleMusicCompanionController } from '../src/services/appleMusic/companion.js';

const ok = { success: true };
const song = (id) => ({ id, name: id, uri: `apple-music:song:${id}`, duration: 60 });
const flush = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

// Exercise the actual controller, with explicit native ACK and presenter gates.
// This does not stand in for physical iOS music/ad playback validation.
function harness(t, { pollIntervalMs = 10000 } = {}) {
  const calls = [];
  const gates = new Set();
  const controllers = [];
  const leases = [];
  const overrides = {};
  let track = null;
  let playing = false;
  let presenter = null;
  const gate = () => {
    const value = deferred();
    gates.add(value);
    return value;
  };
  const invoke = async (method, commit) => {
    calls.push(method);
    const result = overrides[method] ? await overrides[method]() : ok;
    if (result !== false && result?.success !== false && !result?.cancelled) commit?.();
    return result;
  };
  const assertSilenceBarrier = () => {
    assert.equal(presenter, null, 'audible native dispatch must wait for presenter drain');
  };
  const service = {
    getAccessToken: async () => ({ accessToken: 'native:appleMusic' }),
    playTrack: async (_token, uri) => {
      assertSilenceBarrier();
      return invoke(`track:${uri.split(':').at(-1)}`, () => {
        track = song(uri.split(':').at(-1));
        playing = true;
      });
    },
    playPlaylist: async (_token, id) => {
      assertSilenceBarrier();
      return invoke(`playlist:${id}`, () => {
        track = song(id);
        playing = true;
      });
    },
    play: async (_token, _platform, options) => {
      assertSilenceBarrier();
      assert.equal(
        leases.some((lease) => lease.held > 0),
        true,
        'music lease restored before play',
      );
      if (options?.isCancelled()) return { success: true, cancelled: true };
      return invoke('resume', () => {
        playing = true;
      });
    },
    pause: () =>
      invoke('pause', () => {
        playing = false;
      }),
    cleanup: () =>
      invoke('stop', () => {
        playing = false;
        track = null;
      }),
    next: () => {
      assertSilenceBarrier();
      return invoke('next');
    },
    previous: () => {
      assertSilenceBarrier();
      return invoke('previous');
    },
    setRepeat: async () => ok,
    setShuffle: () => invoke('shuffle'),
    getCurrentPlayback: async () => {
      calls.push('read');
      return { item: track, is_playing: playing, progress_ms: 1000 };
    },
  };
  const controller = () => {
    const lease = { held: 0, acquired: 0, released: 0 };
    leases.push(lease);
    const value = createAppleMusicCompanionController({
      service,
      pollIntervalMs,
      waitForPresenters: () => presenter?.promise || Promise.resolve(),
      acquireBlocker: () => {
        lease.held++;
        lease.acquired++;
        let live = true;
        return () => {
          assert.equal(live, true, 'own lease released only once');
          live = false;
          lease.held--;
          lease.released++;
        };
      },
    });
    controllers.push(value);
    return { player: value, lease };
  };
  const original = controller();
  t.after(async () => {
    presenter = null;
    for (const pending of gates) pending.resolve(ok);
    for (const player of controllers) await player.dispose();
  });
  return {
    ...original,
    calls,
    overrides,
    gate,
    controller,
    holdPresenter() {
      assert.equal(presenter, null);
      const pending = gate();
      presenter = pending;
      return () => {
        presenter = null;
        pending.resolve();
      };
    },
    async start(id = 'old') {
      await original.player.playTrack(song(id));
      await flush();
      calls.length = 0;
    },
    get playing() {
      return playing;
    },
    get track() {
      return track;
    },
  };
}

test('Start ad yields only its own blocker after native pause ACK and preserves queue ownership', async (t) => {
  const h = harness(t);
  await h.start();
  const foreignLease = { held: 1 };
  const pause = h.gate();
  h.overrides.pause = () => pause.promise;
  const pending = h.player.beginStartAdBoundary();
  await flush();
  assert.deepEqual(h.calls, ['pause']);
  assert.equal(h.lease.held, 1);
  assert.equal(h.player.getState().playing, true);
  assert.equal(h.player.isActive(), true);
  pause.resolve(ok);
  const ticket = await pending;
  assert.equal(typeof ticket.finish, 'function');
  assert.equal(h.lease.held, 0);
  assert.equal(foreignLease.held, 1);
  assert.equal(h.player.getState().ownsQueue, true);
  assert.equal(h.player.getState().track.id, 'old');
  assert.equal(h.player.getState().playing, false);
  h.player.setVisible(false);
  assert.equal(h.lease.held, 0, 'ordinary publish must not reacquire yielded own lease');
  assert.equal(await h.player.beginStartAdBoundary(), null, 'one retained boundary per owner');
  await ticket.finish();
  assert.equal(h.lease.held, 1);
  assert.equal(foreignLease.held, 1);
});

test('expected ad inactive survives; finish restores lease before drain/resume and retains Start lineage', async (t) => {
  const h = harness(t);
  await h.start();
  const ticket = await h.player.beginStartAdBoundary();
  assert.equal(ticket.beforePresent(), true);
  assert.equal(ticket.beforePresent(), false);
  const dismiss = h.holdPresenter();
  h.player.setAppState('inactive');
  assert.equal(ticket.isCurrent(), true);
  h.player.setAppState('active');
  assert.equal(h.calls.includes('resume'), false, 'foreground alone never resumes music');
  const finish = ticket.finish({ resume: true });
  assert.equal(h.lease.held, 1, 'restore is synchronous before any await');
  await flush();
  assert.equal(h.calls.includes('resume'), false);
  dismiss();
  assert.equal((await finish).resumed, true);
  assert.equal(h.playing, true);
  assert.equal(ticket.isCurrent(), true, 'parent commits Start after awaited finish');
  assert.equal(ticket.finish({ resume: true }), finish, 'finish is idempotent');
  assert.equal(h.calls.filter((call) => call === 'resume').length, 1);
  await h.player.pause();
  assert.equal(ticket.isCurrent(), false, 'later manual intent fences finished lineage');
});

test('originally paused queue stays paused and ordinary metadata polling resumes after finish', async (t) => {
  const h = harness(t, { pollIntervalMs: 5 });
  await h.start();
  await h.player.pause();
  const ticket = await h.player.beginStartAdBoundary();
  h.calls.length = 0;
  assert.deepEqual(await ticket.finish({ resume: true }), { success: true, resumed: false });
  assert.equal(h.lease.held, 1);
  assert.equal(h.playing, false);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(h.calls.includes('read'), true);
  assert.equal(h.calls.includes('resume'), false);
  assert.equal(ticket.isCurrent(), true);
});

test('native pause false/throw retains blocker, playing state and checked failure', async (t) => {
  for (const mode of ['false', 'throw']) {
    const h = harness(t);
    await h.start();
    h.overrides.pause = async () => {
      if (mode === 'throw') throw new Error('pause rejected');
      return { success: false, error: 'pause rejected' };
    };
    const result = await h.player.beginStartAdBoundary();
    assert.equal(result.success, false);
    assert.equal(h.lease.held, 1);
    assert.equal(h.player.getState().playing, true);
    assert.equal(h.calls.includes('resume'), false);
    delete h.overrides.pause;
    const retry = await h.player.beginStartAdBoundary();
    assert.equal(typeof retry.finish, 'function');
    await retry.finish();
  }
});

test('manual Pause cancels yielded boundary immediately without stale resume', async (t) => {
  const h = harness(t);
  await h.start();
  const ticket = await h.player.beginStartAdBoundary();
  const pause = h.gate();
  h.overrides.pause = () => pause.promise;
  const manual = h.player.pause();
  assert.equal(ticket.isCurrent(), false);
  assert.equal(h.lease.held, 1);
  assert.equal((await ticket.finish({ resume: true })).cancelled, true);
  pause.resolve(ok);
  await manual;
  assert.equal(h.calls.includes('resume'), false);
  assert.equal(h.playing, false);
});

test('clear waits stop ACK and invalidates old Start without touching a subsequent queue', async (t) => {
  const h = harness(t);
  await h.start();
  const ticket = await h.player.beginStartAdBoundary();
  const stop = h.gate();
  h.overrides.stop = () => stop.promise;
  const clear = h.player.clear();
  assert.equal(ticket.isCurrent(), false);
  assert.equal(h.lease.held, 1);
  await flush();
  assert.equal(h.player.isActive(), true);
  stop.resolve(ok);
  await clear;
  assert.equal(h.lease.held, 0);
  delete h.overrides.stop;
  await h.player.playTrack(song('new'));
  assert.equal((await ticket.finish({ resume: true })).cancelled, true);
  assert.equal(h.track.id, 'new');
  assert.equal(h.calls.includes('resume'), false);
});

test('same-owner new Play cancels ad intent and waits native pause ACK plus presenter drain', async (t) => {
  const h = harness(t);
  await h.start();
  const pause = h.gate();
  h.overrides.pause = () => pause.promise;
  const pendingBoundary = h.player.beginStartAdBoundary();
  await flush();
  const dismiss = h.holdPresenter();
  const play = h.player.playTrack(song('new'));
  await flush();
  assert.equal(h.calls.includes('track:new'), false);
  dismiss();
  await flush();
  assert.equal(
    h.calls.includes('track:new'),
    false,
    'old native pause must settle before new play',
  );
  pause.resolve(ok);
  assert.equal(await pendingBoundary, null);
  await play;
  assert.equal(h.track.id, 'new');
  assert.equal(h.playing, true);
  assert.equal(h.lease.held, 1);
});

test('new account waits an old pending native ad pause before acquiring its queue', async (t) => {
  const h = harness(t);
  await h.start();
  const pause = h.gate();
  h.overrides.pause = () => pause.promise;
  const pendingBoundary = h.player.beginStartAdBoundary();
  await flush();
  const newer = h.controller();
  const play = newer.player.playTrack(song('new-account'));
  await flush();
  assert.equal(h.calls.includes('track:new-account'), false);
  pause.resolve(ok);
  assert.equal(await pendingBoundary, null);
  await play;
  assert.equal(h.player.getState().ownsQueue, false);
  assert.equal(h.lease.held, 0);
  assert.equal(newer.lease.held, 1);
  assert.equal(h.track.id, 'new-account');
  assert.equal(h.playing, true);
});

test('stale old-account finish cannot resume, stop, or acquire another owner lease', async (t) => {
  const h = harness(t);
  await h.start();
  const ticket = await h.player.beginStartAdBoundary();
  const newer = h.controller();
  await newer.player.playTrack(song('new-account'));
  const acquisitions = h.lease.acquired;
  h.calls.length = 0;
  assert.equal(ticket.isCurrent(), false);
  assert.equal((await ticket.finish({ resume: true })).cancelled, true);
  assert.equal(
    h.lease.acquired,
    acquisitions,
    'stale finish never reacquires the old private lease',
  );
  await h.player.clear();
  assert.equal(h.calls.includes('resume') || h.calls.includes('stop'), false);
  assert.equal(h.lease.held, 0);
  assert.equal(newer.lease.held, 1);
  assert.equal(h.track.id, 'new-account');
});

test('next/previous invalidate boundary and cannot dispatch under native presenter barrier', async (t) => {
  for (const method of ['next', 'previous']) {
    const h = harness(t);
    await h.start();
    const ticket = await h.player.beginStartAdBoundary();
    const dismiss = h.holdPresenter();
    const control = h.player[method]();
    assert.equal(ticket.isCurrent(), false);
    assert.equal(h.lease.held, 1);
    await flush();
    assert.equal(h.calls.includes(method), false);
    dismiss();
    await control;
    assert.equal(h.calls.includes(method), true);
    assert.equal((await ticket.finish({ resume: true })).cancelled, true);
  }
});

test('background retires a next request waiting on presenter and never retries on foreground', async (t) => {
  const h = harness(t);
  await h.start();
  const dismiss = h.holdPresenter();
  const next = h.player.next();
  h.player.setAppState('background');
  h.player.setAppState('active');
  dismiss();
  assert.equal((await next).cancelled, true);
  assert.equal(h.calls.includes('next'), false);
});

test('cue handoff refuses an ad boundary and waits presenters after boundary cancellation', async (t) => {
  const h = harness(t);
  await h.start();
  const ticket = await h.player.beginStartAdBoundary();
  assert.equal(await h.player.suspendForCue(), null);
  const dismiss = h.holdPresenter();
  h.player.cancelCueResume();
  const pauses = h.calls.filter((call) => call === 'pause').length;
  const suspend = h.player.suspendForCue();
  await flush();
  assert.equal(h.calls.filter((call) => call === 'pause').length, pauses);
  dismiss();
  const cue = await suspend;
  assert.equal(typeof cue.release, 'function');
  assert.equal(
    await h.player.beginStartAdBoundary(),
    null,
    'cue ticket owns the pause until release',
  );
  cue.release();
  const nextBoundary = await h.player.beginStartAdBoundary();
  assert.equal(typeof nextBoundary.finish, 'function');
  await nextBoundary.finish();
  assert.equal((await ticket.finish({ resume: true })).cancelled, true);
});

test('unexpected inactive and actual background permanently cancel even across foreground', async (t) => {
  for (const mode of ['unexpected-inactive', 'ad-background', 'legacy-false']) {
    const h = harness(t);
    await h.start();
    const ticket = await h.player.beginStartAdBoundary();
    if (mode !== 'unexpected-inactive') assert.equal(ticket.beforePresent(), true);
    if (mode === 'legacy-false') h.player.setAppActive(false);
    else h.player.setAppState(mode === 'ad-background' ? 'background' : 'inactive');
    assert.equal(ticket.isCurrent(), false);
    assert.equal(h.lease.held, 1);
    h.player.setAppState('active');
    assert.equal((await ticket.finish({ resume: true })).cancelled, true);
    assert.equal(h.calls.includes('resume'), false);
  }
});

test('caller cancellation and user-visible UI prevent presentation and stale resume', async (t) => {
  for (const mode of ['caller', 'visible', 'permission']) {
    const h = harness(t);
    await h.start();
    let current = true;
    const ticket = await h.player.beginStartAdBoundary({ isCurrent: () => current });
    if (mode === 'caller') current = false;
    if (mode === 'visible') h.player.setVisible(true);
    if (mode === 'permission') await h.player.runPermission(async () => ok);
    assert.equal(ticket.beforePresent(), false);
    assert.equal((await ticket.finish({ resume: true })).cancelled, true);
    assert.equal(h.calls.includes('resume'), false);
    assert.equal(h.lease.held, 1);
  }
});

test('no owner, visible player, pending permission or native cue pause cannot yield a boundary', async (t) => {
  const h = harness(t);
  assert.equal(await h.player.beginStartAdBoundary(), null);
  await h.start();
  h.player.setVisible(true);
  assert.equal(await h.player.beginStartAdBoundary(), null);
  h.player.setVisible(false);
  const permission = h.gate();
  const authorize = h.player.runPermission(() => permission.promise);
  assert.equal(await h.player.beginStartAdBoundary(), null);
  permission.resolve(ok);
  await authorize;
  const pause = h.gate();
  h.overrides.pause = () => pause.promise;
  const suspend = h.player.suspendForCue();
  await flush();
  assert.equal(await h.player.beginStartAdBoundary(), null);
  assert.equal(h.lease.held, 1);
  pause.resolve(ok);
  const cue = await suspend;
  cue.release();
});

test('checked resume failure keeps queue paused and lease held; old Start is invalid', async (t) => {
  for (const mode of ['false', 'throw']) {
    const h = harness(t);
    await h.start();
    const ticket = await h.player.beginStartAdBoundary();
    h.overrides.resume = async () => {
      if (mode === 'throw') throw new Error('resume rejected');
      return false;
    };
    const result = await ticket.finish({ resume: true });
    assert.equal(result.success, false);
    assert.equal(ticket.isCurrent(), false);
    assert.equal(h.lease.held, 1);
    assert.equal(h.player.getState().ownsQueue, true);
    assert.equal(h.player.getState().playing, false);
    assert.equal(h.playing, false);
  }
});

test('cancelled native replies cannot acknowledge silence or leave Start eligible after failed restore', async (t) => {
  const h = harness(t);
  await h.start();
  h.overrides.pause = async () => ({ success: true, cancelled: true });
  assert.equal((await h.player.beginStartAdBoundary()).success, false);
  assert.equal(h.lease.held, 1);
  delete h.overrides.pause;
  const ticket = await h.player.beginStartAdBoundary();
  h.overrides.resume = async () => ({ success: true, cancelled: true });
  assert.equal((await ticket.finish({ resume: true })).cancelled, true);
  assert.equal(ticket.isCurrent(), false);
  assert.equal(h.lease.held, 1);
  assert.equal(h.player.getState().playing, false);
});

test('new Play waits an in-flight ad resume ACK before installing a different native queue', async (t) => {
  const h = harness(t);
  await h.start();
  const ticket = await h.player.beginStartAdBoundary();
  const resume = h.gate();
  h.overrides.resume = () => resume.promise;
  const finish = ticket.finish({ resume: true });
  await flush();
  const play = h.player.playTrack(song('new'));
  assert.equal(ticket.isCurrent(), false);
  await flush();
  assert.equal(h.calls.includes('track:new'), false);
  resume.resolve(ok);
  assert.equal((await finish).cancelled, true);
  await play;
  assert.equal(h.track.id, 'new');
  assert.equal(h.playing, true);
});

test('delegated retired-owner recovery cannot stop/release ownership ahead of its pending native pause', async (t) => {
  const h = harness(t);
  await h.start();
  const pause = h.gate();
  h.overrides.pause = () => pause.promise;
  const boundary = h.player.beginStartAdBoundary();
  await flush();
  const disposed = h.player.dispose();
  const newer = h.controller();
  const recover = newer.player.clear();
  await flush();
  assert.equal(h.calls.includes('stop'), false, 'delegated stop waits the old transport ACK');
  assert.equal(newer.player.isActive(), true);
  assert.equal(h.lease.held, 1);
  pause.resolve(ok);
  assert.equal(await boundary, null);
  await Promise.all([disposed, recover]);
  assert.equal(h.calls.filter((call) => call === 'stop').length, 1);
  assert.equal(h.lease.held, 0);
  assert.equal(newer.player.isActive(), false);
  await newer.player.playTrack(song('new-account'));
  assert.equal(h.track.id, 'new-account');
  assert.equal(h.playing, true);
});

test('no boundary is created during a reserved Play or after failed retired-owner cleanup', async (t) => {
  const h = harness(t);
  const dismiss = h.holdPresenter();
  const play = h.player.playTrack(song('first'));
  assert.equal(await h.player.beginStartAdBoundary(), null);
  dismiss();
  await play;
  h.overrides.stop = async () => false;
  await h.player.dispose();
  const newer = h.controller();
  assert.equal(newer.player.getState().previousOwnerPending, true);
  assert.equal(await newer.player.beginStartAdBoundary(), null);
  delete h.overrides.stop;
  await newer.player.clear();
});
