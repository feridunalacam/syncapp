import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionAdActions } from '../src/services/ads/sessionActions.js';

const settle = () => new Promise(setImmediate);
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function setup(options = {}) {
  const state = {
    identity: 'account-a',
    routine: { id: 'routine-one' },
    sessionKey: null,
    active: false,
    focused: true,
    appActive: true,
    blocked: false,
    musicPlaying: false,
    audioSyncing: false,
    ...options.state,
  };
  const events = [];
  const busy = [];
  const shows = [];
  const starts = [];
  const finishes = [];
  let idleCalls = 0;
  const controller = createSessionAdActions({
    getState: () => state,
    stopAudioPreview: async () => {
      events.push('stop-preview');
      await options.stopAudioPreview?.();
    },
    waitForAdsIdle: async () => {
      events.push('idle');
      await options.waitForAdsIdle?.(++idleCalls);
    },
    showAd: async (request) => {
      events.push('show');
      shows.push(request);
      return options.showAd ? await options.showAd(request) : { shown: false, reason: 'not-ready' };
    },
    waitForForeground: async () => {
      events.push('foreground');
      return options.waitForForeground?.();
    },
    startSession: () => {
      events.push('start');
      const result = options.startSession?.();
      if (result !== false) starts.push(state.routine);
      return result;
    },
    finishSession: (key) => {
      events.push('finish');
      finishes.push(key);
    },
    onBusy: (value) => busy.push(value),
  });
  return { controller, state, events, busy, shows, starts, finishes };
}

test('no-fill and Pro-ineligible ad results still start after the shared presenter drains', async () => {
  for (const reason of ['not-ready', 'ineligible']) {
    const app = setup({ showAd: async () => ({ shown: false, reason }) });
    const result = await app.controller.start({ opportunityId: 'start:one' });
    assert.deepEqual(result, { performed: true, reason: 'completed', kind: 'start', shown: false });
    assert.deepEqual(app.events, ['stop-preview', 'idle', 'show', 'idle', 'start']);
    assert.deepEqual(app.busy, [true, false]);
    assert.equal(app.starts.length, 1);
  }
});

test('double Start taps share one operation and cannot begin behind a visible ad', async () => {
  const closed = deferred();
  const app = setup({ showAd: () => closed.promise });
  const first = app.controller.start({ opportunityId: 'start:one' });
  const duplicate = app.controller.start({ opportunityId: 'start:two' });
  assert.equal(first, duplicate);
  await settle();
  assert.equal(app.shows.length, 1);
  assert.equal(app.starts.length, 0);
  assert.deepEqual(app.busy, [true]);
  closed.resolve({ shown: true, reason: 'closed' });
  assert.equal((await first).performed, true);
  assert.equal(app.starts.length, 1);
  assert.deepEqual(app.busy, [true, false]);
});

test('a final synchronous workout guard can reject Start without reporting a performed action', async () => {
  const app = setup({ startSession: () => false });
  const result = await app.controller.start({ opportunityId: 'start:one' });
  assert.deepEqual(result, { performed: false, reason: 'cancelled', kind: 'start', shown: false });
  assert.equal(app.starts.length, 0);
  assert.deepEqual(app.busy, [true, false]);
});

test('a shared consent/privacy presenter must drain before any new ad or workout', async () => {
  const idle = deferred();
  const app = setup({ waitForAdsIdle: (call) => (call === 1 ? idle.promise : undefined) });
  const starting = app.controller.start({ opportunityId: 'start:one' });
  await settle();
  assert.deepEqual(app.events, ['stop-preview', 'idle']);
  assert.equal(app.starts.length, 0);
  idle.resolve();
  await starting;
  assert.equal(app.starts.length, 1);
});

test('routine, identity and session changes retire an old Start continuation', async () => {
  for (const change of [
    (state) => (state.routine = { id: 'routine-one' }),
    (state) => (state.identity = 'account-b'),
    (state) => (state.sessionKey = 'new-session'),
    (state) => (state.active = true),
    (state) => (state.blocked = true),
  ]) {
    const closed = deferred();
    const app = setup({ showAd: () => closed.promise });
    const starting = app.controller.start({ opportunityId: 'start:one' });
    await settle();
    change(app.state);
    assert.equal(app.shows[0].isEligible(), false);
    closed.resolve({ shown: true, reason: 'closed' });
    assert.equal((await starting).performed, false);
    assert.equal(app.starts.length, 0);
  }
});

test('blur or background before showing skips the ad and never queues automatic Start', async () => {
  for (const field of ['focused', 'appActive']) {
    const idle = deferred();
    const app = setup({ waitForAdsIdle: () => idle.promise });
    const starting = app.controller.start({ opportunityId: 'start:one' });
    await settle();
    app.state[field] = false;
    idle.resolve();
    assert.equal((await starting).performed, false);
    assert.equal(app.shows.length, 0);
    assert.equal(app.starts.length, 0);
  }
});

test('a closed ad waits for actual foreground restoration, then rechecks focus', async () => {
  const foreground = deferred();
  let app;
  app = setup({
    showAd: async () => {
      app.state.appActive = false;
      return { shown: true, reason: 'closed' };
    },
    waitForForeground: () => foreground.promise,
  });
  const starting = app.controller.start({ opportunityId: 'start:one' });
  await settle();
  assert.equal(app.events.at(-1), 'foreground');
  assert.equal(app.starts.length, 0);
  app.state.appActive = true;
  app.state.focused = false;
  foreground.resolve(true);
  assert.equal((await starting).performed, false);
  assert.equal(app.starts.length, 0);
});

test('foreground recovery allows Start only while the same action remains safe', async () => {
  for (const returnsActive of [true, false]) {
    let app;
    app = setup({
      showAd: async () => {
        app.state.appActive = false;
        return { shown: true, reason: 'closed' };
      },
      waitForForeground: async () => {
        app.state.appActive = returnsActive;
        return returnsActive;
      },
    });
    const result = await app.controller.start({ opportunityId: 'start:one' });
    assert.equal(result.performed, returnsActive);
    assert.equal(app.starts.length, returnsActive ? 1 : 0);
  }
});

test('cancel and unmount invalidate continuations without releasing the native close barrier', async () => {
  for (const action of ['cancel', 'dispose']) {
    const closed = deferred();
    const app = setup({ showAd: () => closed.promise });
    let done = false;
    const starting = app.controller.start({ opportunityId: 'start:one' });
    starting.then(() => (done = true));
    await settle();
    app.controller[action]();
    assert.equal(app.controller.start({ opportunityId: 'start:two' }), starting);
    await settle();
    assert.equal(done, false);
    assert.deepEqual(app.busy, [true]);
    closed.resolve({ shown: true, reason: 'closed' });
    assert.equal((await starting).performed, false);
    assert.equal(app.starts.length, 0);
    assert.deepEqual(app.busy, action === 'dispose' ? [true] : [true, false]);
  }
});

test('failed preview cleanup or an undrained presenter never starts or shows an ad', async () => {
  const preview = setup({
    stopAudioPreview: async () => {
      throw new Error('Preview stop failed');
    },
  });
  assert.equal((await preview.controller.start()).reason, 'cleanup-error');
  assert.deepEqual(preview.events, ['stop-preview', 'idle']);
  assert.equal(preview.shows.length, 0);
  assert.equal(preview.starts.length, 0);
  const presenter = setup({
    waitForAdsIdle: async () => {
      throw new Error('Presenter lifetime is not known');
    },
  });
  assert.equal((await presenter.controller.start()).reason, 'presentation-unsafe');
  assert.equal(presenter.shows.length, 0);
  assert.equal(presenter.starts.length, 0);
});

test('a throwing show wrapper must drain its presenter before safe no-ad fallback', async () => {
  const closed = deferred();
  const app = setup({
    showAd: async () => {
      throw new Error('Bridge wrapper failed after presentation request');
    },
    waitForAdsIdle: (call) => (call === 2 ? closed.promise : undefined),
  });
  const starting = app.controller.start({ opportunityId: 'start:one' });
  await settle();
  assert.equal(app.starts.length, 0);
  closed.resolve();
  assert.equal((await starting).performed, true);
  assert.equal(app.starts.length, 1);
});

test('music playback or audio synchronization skips fullscreen ads without changing Start intent', async () => {
  for (const state of [
    { musicPlaying: true },
    { audioSyncing: true },
    { musicPlaying: undefined },
  ]) {
    const app = setup({ state });
    assert.equal((await app.controller.start({ opportunityId: 'start:one' })).performed, true);
    assert.equal(app.shows.length, 0);
    assert.equal(app.starts.length, 1);
  }
});

test('Finish waits for native close, dismisses only its captured summary and never starts', async () => {
  const closed = deferred();
  const app = setup({ state: { sessionKey: 'ended:one' }, showAd: () => closed.promise });
  const finishing = app.controller.finish({ opportunityId: 'finish:one' });
  assert.equal(app.controller.finish({ opportunityId: 'finish:two' }), finishing);
  await settle();
  assert.deepEqual(app.finishes, []);
  closed.resolve({ shown: true, reason: 'closed' });
  assert.deepEqual(await finishing, {
    performed: true,
    reason: 'completed',
    kind: 'finish',
    shown: true,
  });
  assert.deepEqual(app.finishes, ['ended:one']);
  assert.equal(app.starts.length, 0);
});

test('new accounts or sessions cannot be dismissed by an old Finish dialog', async () => {
  for (const change of [
    (state) => (state.identity = 'account-b'),
    (state) => (state.sessionKey = 'ended:two'),
    (state) => (state.active = true),
  ]) {
    const closed = deferred();
    const app = setup({ state: { sessionKey: 'ended:one' }, showAd: () => closed.promise });
    const finishing = app.controller.finish({ opportunityId: 'finish:one' });
    await settle();
    change(app.state);
    closed.resolve({ shown: true, reason: 'closed' });
    assert.equal((await finishing).performed, false);
    assert.deepEqual(app.finishes, []);
  }
});

test('an explicit Finish can dismiss its owned ended summary after blur without a surprise ad', async () => {
  const idle = deferred();
  const app = setup({
    state: { sessionKey: 'ended:one' },
    waitForAdsIdle: () => idle.promise,
  });
  const finishing = app.controller.finish({ opportunityId: 'finish:one' });
  await settle();
  app.state.focused = false;
  app.state.appActive = false;
  idle.resolve();
  assert.equal((await finishing).performed, true);
  assert.equal(app.shows.length, 0);
  assert.deepEqual(app.finishes, ['ended:one']);
});

test('a missing routine, active session or absent ended key performs no action', async () => {
  for (const state of [{ routine: null }, { active: true }, { identity: undefined }]) {
    const app = setup({ state });
    assert.equal((await app.controller.start()).performed, false);
    assert.deepEqual(app.events, []);
  }
  const app = setup();
  assert.equal((await app.controller.finish()).performed, false);
  assert.deepEqual(app.events, []);
});
